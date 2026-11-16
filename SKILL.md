---
name: xiangsu100-figma-to-html
description: 从 Figma Frame、Section 或 Prototype 还原和修订 HTML，先明确设计依据、改动范围与验收预期，再检查原始素材、真实字体、完整交互状态及同尺寸截图对照。用于设计稿转 HTML、破图修复和多页面交互 Demo。
license: MIT
metadata:
  version: 0.3.0
  source: https://github.com/baokeni/xiangsu100-figma-to-html
---

# 像素100 · Figma 还原 HTML

保留设计与用户约定，输出能打开、能操作、可复查的HTML。自动检查、AI视觉复查和用户验收分别记录；不承诺未经证明的1:1。

这是官方Figma design-to-code流程的独立增强层。调用设计上下文工具前，若环境已有官方figma-design-to-code，加载并遵守实际契约；否则先确认当前工具能力与官方说明。不得改写官方插件缓存或虚构工具。[来源边界](references/upstream.md)。

## 执行顺序

1. **依据与范围。** 先读[设计依据与验收表](references/design-contract.md)，定位用户实际指的控件，记录允许改变、必须保留和有来源的验收期望。已有授权足够就继续，不逐项请求批准。沿用用户技术栈；需直接打开时默认原生HTML/CSS/JS，保留源稿和历史版本。
2. **读取设计。** 取得指定节点的结构化高精度上下文和同节点截图；sparse/metadata不足时按节点分区补读。Section/多页面任务另读[页面与Prototype说明](references/intake-and-prototype.md)，枚举全部页面/状态与起点，读取有序动作；不能按画板排列猜导航或只做第一张。
3. **实现。** 先按[素材复用说明](references/assets-and-portability.md)选原图/原SVG/组件，素材存本地并记录槽位；布局用正常文档流/Flex/Grid，正文保留HTML。遵循完整变体和本地补全边界，不以“补交互”擅自重设计页面。
4. **核对与修正。** 逐页检查下列四项并读对应参考；有原稿的关键状态按相同视口/DPR截图，生成50%叠图与增强差异图，实际看图、修正并重截。没有可修问题时记录事实，不为凑轮次改代码。
5. **交付。** 目录版与需要的内嵌版分别验证，完整链路在目标打开方式重走。交付当前入口、原稿/当前截图与对照、检查覆盖、仍未还原/无法验证项。修改后同步源稿、单文件、对照及包；旧截图不能代表新源码。

## 四项核对

- **素材与打开方式**：[素材说明](references/assets-and-portability.md)。分别证明文件存在、解码成功、槽位/比例/裁切正确及目标打开方式可用；不用临时Figma URL运行，不重画已有素材，不以整页截图代替实现。复杂SVG先实测；独立导出留意背景、祖先裁切与阴影外扩。开发省时与运行提速分开举证。
- **真实字体与内容**：[字体和细线](references/typography-and-strokes.md)。核对逐段字体/字重、行高、文本框和混排；查项目/用户/系统字体的内部名，再核对浏览器实际字体，CSS声明不算证明。缺失、未读取和有意隐藏按依据表区分；检查横滑/折叠/切换后的文案。字体嵌入/子集化须符合使用范围，原字体不进入公开Skill。
- **几何、细线与颜色**：保留小数、描边对齐、渐变/变换、圆角和render bounds，不把复杂描边降级成纯色border。记录视口/DPR；核对Display P3/sRGB、透明合成及ICC，不整体提亮来掩盖局部错误。先排查实现遗漏，再归因引擎差异。
- **状态、截图与覆盖**：[验证说明](references/verification-and-delivery.md)。按来源/用户要求检查完整变体、实际内容或共享列表、取消/返回/状态恢复。关键文字需实际可见；只看textContent或点击成功不足。用普通点击，不以force掩盖遮挡。均值/SSIM仅诊断，不换算还原率。没有原稿的模拟状态只记实现检查。

## 当前工具与交付边界

verify_delivery.mjs执行已配置的检查并截图，不自动读懂设计；必须查看coverage、warnings和仍pending的视觉复查。compare_screenshots.py统一色彩空间；透明输入须明确共同背景，不能丢alpha。bundle_html.py仅支持说明中的普通本地HTML，复杂工程用项目构建工具。

macOS受限终端启动浏览器时，按宿主权限规则一次获取所需权限或用已连接受管浏览器；独立临时profile、chromiumSandbox:true，不接管日常会话、不用--no-sandbox、不批量kill。工具缺失时说明实际缺口，继续独立可做部分，不假称已截图/已验收。

以后仍维护[同一个Skill](references/maintenance.md)：先保留失败证据和最小回归，再收敛最窄规则/脚本。案例参数留项目；公开包不放真实设计、字体、聊天、凭据、临时URL或本机路径。发布按当次用户授权。
