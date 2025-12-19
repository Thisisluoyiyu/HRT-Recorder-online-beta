import { DoseEvent, Route, runSimulation, CalibrationFactors } from './logic';

/**
 * 用户输入的测定记录
 */
export interface LabMeasurement {
    id: string;
    timeH: number;      // 测量时间（小时，与 DoseEvent 同一基准）
    concPGmL: number;   // 测定结果 (pg/mL)
    ignored?: boolean;  // 是否被标记为忽略（误差过大手动或自动排除）
}

/**
 * 异常检测配置
 */
const OUTLIER_THRESHOLD_RATIO = 3.0; // 如果 测定值/预测值 > 3.0 或 < 1/3.0，视为异常
const MIN_CONTRIBUTION_RATIO = 0.1;  // 某路由贡献低于总浓度的 10% 时，不更新其权重（避免噪音）

/**
 * 计算校准因子
 * 
 * 算法逻辑：
 * 1. 按时间顺序遍历所有测定数据。
 * 2. 对每个测定点，计算未校准的理论浓度。
 * 3. 比较 实测 vs 理论，计算瞬时偏差 (Instant Ratio)。
 * 4. 识别当前起作用的 Route（如口服、注射）。
 * 5. 使用指数移动平均 (EMA) 更新 Route 的校准因子。
 * 
 * @param measurements 用户的测定记录列表
 * @param events 用户的用药记录
 * @param bodyWeightKG 用户体重
 * @returns 计算后的各路由校准因子
 */
export function calculateCalibrationFactors(
    measurements: LabMeasurement[],
    events: DoseEvent[],
    bodyWeightKG: number
): CalibrationFactors {
    
    // 初始化因子，默认为 1.0
    const currentFactors: Record<string, number> = {}; // 使用 string key 方便索引
    
    // 按时间排序测定数据
    const sortedMeasurements = [...measurements]
        .filter(m => !m.ignored)
        .sort((a, b) => a.timeH - b.timeH);

    if (sortedMeasurements.length === 0) {
        return {};
    }

    // 辅助函数：获取某时刻各路由的未校准贡献值
    // 这里我们需要稍微魔改一下 runSimulation 的思路，针对单点计算
    // 为了性能，我们不重复跑 runSimulation，而是利用 logic 内部的计算逻辑
    // 但由于 logic.ts 没暴露内部类，我们这里用一种简化的“模拟”调用方式：
    // 我们用全 1.0 的因子跑一次模拟，然后用 interpolate 查值？
    // 不行，那样分不清路由贡献。
    // 因此：我们假设 logic.ts 能够支持“返回各路由分量”的模拟，或者我们在这里简单重新实现一下求和逻辑。
    // 为了代码复用且不破坏 logic.ts 结构，我们通过多次调用 runSimulation (每次只给一种路由的事件) 来获取分量。
    // *注意*：虽然效率略低，但考虑到测定点很少（通常 < 20 个），这是可接受的。

    const uniqueRoutes = Array.from(new Set(events.map(e => e.route)));
    
    // 预计算所有路由的完整曲线（未校准状态）
    const routeSimulations: Record<string, any> = {};
    for (const r of uniqueRoutes) {
        const routeEvents = events.filter(e => e.route === r);
        const sim = runSimulation(routeEvents, bodyWeightKG, {}); // 纯净模拟
        routeSimulations[r] = sim;
    }

    // 辅助：从模拟结果插值
    const getConcAt = (sim: any, t: number) => {
        if (!sim) return 0;
        // 简单的线性插值实现 (复用 logic.ts 的 interpolate 逻辑)
        // 这里为了独立性，简单手写一个查找
        const times = sim.timeH;
        const concs = sim.concPGmL;
        if (t <= times[0]) return concs[0];
        if (t >= times[times.length-1]) return concs[concs.length-1];
        
        // 二分查找
        let low = 0, high = times.length - 1;
        while (high - low > 1) {
            const mid = Math.floor((low + high) / 2);
            if (times[mid] < t) low = mid;
            else high = mid;
        }
        const t0 = times[low], t1 = times[high];
        const c0 = concs[low], c1 = concs[high];
        if (t1 === t0) return c0;
        return c0 + (c1 - c0) * (t - t0) / (t1 - t0);
    };

    // 遍历测定点，更新因子
    for (const m of sortedMeasurements) {
        const t = m.timeH;
        const measured = m.concPGmL;

        // 1. 计算当前各路由的“预期”贡献（基于当前累积的因子）
        const contributions: Record<string, number> = {};
        let totalPredicted = 0;

        for (const r of uniqueRoutes) {
            const rawConc = getConcAt(routeSimulations[r], t);
            const currentFactor = currentFactors[r] ?? 1.0;
            const calibratedConc = rawConc * currentFactor;
            
            contributions[r] = calibratedConc;
            totalPredicted += calibratedConc;
        }

        if (totalPredicted < 1.0) {
            // 预测浓度极低（可能是停药期或数据错误），此时测定数据参考意义不大，或者是本底值
            // 为防止除零错误，跳过
            continue;
        }

        // 2. 计算偏差比率
        // Ratio = 实测 / 预测
        // 例如：实测 200，预测 100，Ratio = 2.0。说明我们需要把整体太高 2 倍。
        const globalRatio = measured / totalPredicted;

        // 3. 异常检测
        if (globalRatio > OUTLIER_THRESHOLD_RATIO || globalRatio < (1.0 / OUTLIER_THRESHOLD_RATIO)) {
            console.warn(`[Calibration] Measurement at ${t}h ignored. Ratio ${globalRatio.toFixed(2)} is an outlier.`);
            continue; // 跳过此异常点
        }

        // 4. 更新因子
        // 策略：谁贡献大，谁背锅。
        // 如果 Oral 贡献 90%，Injection 贡献 10%。实测偏高。我们将 90% 的校准权重给 Oral。
        
        // 动态权重 alpha:
        // 新数据权重。第一条数据权重 1.0 (完全信任)，后续数据权重 0.3 (保守更新)
        // 我们可以简单判断：如果这是该路由第一次参与校准，则 alpha = 1.0，否则 alpha = 0.3
        
        const isFirstGlobal = Object.keys(currentFactors).length === 0;

        for (const r of uniqueRoutes) {
            const contributionConc = contributions[r];
            const contributionShare = contributionConc / totalPredicted; // 该路由占总浓度的比例

            if (contributionShare < MIN_CONTRIBUTION_RATIO) {
                // 贡献太小，不调整该路由的因子 (避免噪音放大)
                continue;
            }

            const oldFactor = currentFactors[r] ?? 1.0;
            const hasHistory = currentFactors.hasOwnProperty(r);

            // 目标因子：如果我们要让总浓度匹配，理论上所有路由都应该乘上 globalRatio
            // TargetFactor = OldFactor * globalRatio
            const targetFactor = oldFactor * globalRatio;

            // 确定更新权重 alpha
            // 越新的数据权重越大 -> EMA
            // 如果是该路由的首个数据，完全信任 (alpha = 1.0)
            // 否则，使用 0.4 的更新率 (倾向于新数据，但保留历史惯性)
            let alpha = hasHistory ? 0.4 : 1.0;

            // 进一步根据 contributionShare 调整 alpha？
            // 逻辑：如果某路由占 100% 贡献，它应当完全承担校准责任。
            // 如果只占 50%，我们可能不想改动太剧烈？
            // 简化方案：直接对 contributing 路由应用 EMA。
            
            const newFactor = oldFactor * (1 - alpha) + targetFactor * alpha;
            
            currentFactors[r] = newFactor;
        }
    }

    return currentFactors;
}