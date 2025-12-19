# HRT 模拟记录仪（网页版）  
> **本仓库 fork 自：[LaoZhong-Mihari/HRT-Recorder-online](https://github.com/LaoZhong-Mihari/HRT-Recorder-online) 并使用Github Pages 托管部署**
**点击[在线访问](https://shintokosei.github.io/HRT-Recorder-online/)开始你的记录**

一款注重隐私的网页工具，用于在激素替代疗法（HRT）期间模拟并追踪雌二醇（Estradiol）水平。

> **✨ 使用 Gemini 3 Vibe Coding 创建**

## 🧠 算法与核心逻辑

本工具所使用的药代动力学算法、数学模型及相关参数，均直接源自 **[HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)** 仓库。

我们严格遵循 **@LaoZhong-Mihari** 提供的 `PKcore.swift` 与 `PKparameter.swift` 中的逻辑，确保网页版模拟结果与原生实现精度一致（包括三室模型、双相储库动力学，以及分层级的舌下吸收建模等）。

## 🚀 功能特性

*   **多给药途径模拟**：支持注射（戊酸酯、苯甲酸酯、环戊丙酸酯、庚酸酯）、口服、舌下含服、凝胶及贴剂。
*   **实时可视化**：交互式图表动态展示预测的雌二醇浓度（pg/mL）随时间变化趋势。
*   **舌下含服指导**：基于严谨医学建模，提供详细的“含服时长”与吸收参数（$\theta$）建议。
*   **隐私优先**：所有数据仅保存于浏览器 `localStorage`，**绝不上传至任何服务器**。
*   **双语支持**：原生支持**简体中文**与**English**。

## 🛠️ 本地运行

本项目基于 **React** 与 **TypeScript** 构建，可借助 [Vite](https://vitejs.dev/) 等现代前端工具链轻松启动：

1.  **克隆或下载** 项目文件。
2.  **（可选）初始化 Vite 项目**：
    ```bash
    npm create vite@latest hrt-recorder -- --template react-ts
    cd hrt-recorder
    npm install
    ```
3.  **安装依赖**：
    ```bash
    npm install recharts lucide-react uuid @types/uuid clsx tailwind-merge
    ```
4.  **配置 Tailwind CSS**：  
    按照 [Tailwind CSS + Vite 指南](https://tailwindcss.com/docs/guides/vite) 生成 `tailwind.config.js`。
5.  **添加代码**：
    *   将 `logic.ts` 与 `index.tsx` 放入 `src/` 目录；
    *   如有必要，调整 `index.html` 入口。
6.  **启动开发服务器**：
    ```bash
    npm run dev
    ```

## 🌐 部署与托管

欢迎您将本应用部署至个人网站、博客或服务器！  
我们希望每位需要它的人都能便捷使用——**无需额外授权即可公开托管**。

**署名要求**：  
若公开部署，请务必：
1.  **保留原始算法署名**：在页面显著位置链接回 [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test) 仓库；
2.  **遵守许可证**：遵循原算法代码所附的许可条款。

*Estimate with joy!* 🏳️‍⚧️