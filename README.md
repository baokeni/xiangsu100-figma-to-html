# xiangsu100-figma-to-html

像素100 · Figma还原HTML增强版，v0.2.1。

以Figma官方design-to-code工作流为基础，补上交付前的素材、字体、细描边、50%叠图和多页面链路检查。由AI读取Skill并执行检查；不会在后台自行运行，也不会绕过Figma登录、浏览器权限或依赖安装。

## 学生安装

有支持Agent Skills的Codex、Claude Code或其他客户端后，在终端安装：

```bash
npx skills add baokeni/xiangsu100-figma-to-html
```

选择自己使用的客户端，安装后按客户端提示重新载入Skill。也可以[下载发布ZIP](https://github.com/baokeni/xiangsu100-figma-to-html/releases/latest/download/xiangsu100-figma-to-html.zip)，解压后把完整的`xiangsu100-figma-to-html`文件夹放入客户端Skill目录；不要只复制SKILL.md，也不要多套一层同名目录。Codex默认用户目录是`~/.codex/skills/`（Windows通常为`%USERPROFILE%\.codex\skills\`）；若设置过`CODEX_HOME`，则使用其下的`skills/`。其他客户端可用上面的安装器选择目标。

本Skill允许按任务自动匹配。首次建议明确调用，方便确认：

```text
使用 $xiangsu100-figma-to-html，把这个Figma画板还原为可直接打开的HTML：
【粘贴含node-id的画板链接】
保留原始素材，完成字体、图片、细线检查和同尺寸截图对照后再交付。
```

### 已安装旧版如何更新

重新运行上面的仓库安装命令，按安装器提示更新同名Skill。ZIP安装者先备份自己的定制，再替换整个同名文件夹，避免混用新旧脚本。更新后按客户端提示重新加载，在`SKILL.md`的`metadata.version`确认是`0.2.1`。

[查看本次版本说明](https://github.com/baokeni/xiangsu100-figma-to-html/releases/tag/v0.2.1)。稳定下载地址始终指向最新正式版；需要固定课堂版本时用对应Release中的ZIP。

## 多页面和 Prototype 怎么用

在Figma中完成Prototype连线后，可以把整条流程一起还原。建议将相关页面放在同一Section，连好跳转/弹层/返回并设定Flow起点，提供**Section设计链接 + Prototype演示链接**。确保当前Figma连接账号可查看，默认用原Frame尺寸验收。Section决定页面范围，Prototype帮助确认行为；不按画板排列顺序猜跳转。

AI先盘点所有页面、节点、尺寸和状态，再读取起点与连线，逐页静态还原后接通链路。筛选弹层、组件变体通常是页面状态，不必各建一个HTML路由。详情跳转、关闭/返回及筛选/滚动恢复都要沿真实路径验证。工具无法读取完整原型时会列出缺口，不冒称已自动读全。

多页面任务可直接复制：

```text
使用 $xiangsu100-figma-to-html 还原下面的多页面流程。
Section设计链接：【填写】
Prototype演示链接：【已有时填写】
流程起点/要演示的链路：【填写】
使用原生HTML/CSS/JS，可直接在浏览器打开，原始素材保存到assets。
先列出全部页面与交互关系，逐页还原，再完成跳转、弹层和返回。
用各Frame原始尺寸截图，生成50%叠图与增强差异图，修正后再对照。
交付可打开入口、检查证据，以及未还原或无法验证的部分。
```

尺寸可由Figma读取；如希望另做手机/桌面适配，请补充目标展示尺寸。已有项目时沿用其技术栈。

准备清单、完整输入模板和行为映射见[多页面说明](references/intake-and-prototype.md)。已有项目沿用技术栈；示例中的React/TypeScript不作为本Skill的统一要求。

## 开始前需要什么

- 能读取该设计文件的Figma MCP连接与权限。安装Skill不等于已连通MCP。
- 支持结构化设计上下文和截图的Figma工具。若客户端已有官方`figma-design-to-code`，增强版会配合它使用；没有时先按工具契约/官方说明确认能力。
- Python 3；截图比较脚本需要Pillow。浏览器脚本需要Node.js和目标项目可解析的Playwright。参考[验证说明](references/verification-and-delivery.md)安装最少依赖。
- 使用相同字体所需的实际字体文件或本机安装字体。仓库不附带商业字体或任何学生设计素材。

## 会检查什么

| 检查 | 交付前的要求 |
| --- | --- |
| 素材复用 | 先判断原SVG、图片和HTML结构；复杂滤镜先实测，不批量重画或转PNG |
| 图片 | 文件非空、可解码、槽位/比例/裁切正确，运行时不用临时Figma URL |
| 单文件 | 单独复制到空目录和无目录基址预览仍能加载，不能只验证开发服务器 |
| 字体 | 内部名称与版本、混排字重、实际渲染字体；包含用户字体目录检查 |
| 细线 | 描边对齐、渐变、圆角、小数坐标与阴影；不擅自简化 |
| 颜色 | P3/sRGB、渐变插值空间、透明合成，以及带ICC截图的正确比较 |
| 截图 | 同画板尺寸的原稿、网页、50%叠图和增强差异图；修正后重新对照 |
| 链路 | 所有目标页面/状态有清单，从起点验证跳转、弹层、取消、返回、滚动/状态恢复 |
| 状态 | 自动检查、AI视觉复查、用户验收分别记录，不承诺未经验证的100%还原 |

辅助脚本不会自动“看懂”设计，也不会替AI批准视觉一致性。它们提供可复查证据；AI仍须看图、定位并修正。

## 脚本入口

```bash
# 先保留目录源稿，再生成可独立打开的副本
python3 scripts/bundle_html.py ./project/source.html --root ./project --output ./project/standalone.html

# 必须先按宿主权限规则配置安全、独立的浏览器执行环境
node scripts/verify_delivery.mjs --html ./project/standalone.html --reference ./project/figma.png --width 393 --height 852 --out ./project/verification --mode standalone

# 正确处理ICC后生成50%叠图、增强差异与并排图；不输出“还原率”
python3 scripts/compare_screenshots.py ./project/figma.png ./project/verification/render.png --out ./project/verification/comparison
```

命令中的尺寸只是示例，必须换成实际画板尺寸。字体和多步骤链路检查用配置文件，支持关闭/URL/滚动状态断言及关键状态截图，格式见[验证说明](references/verification-and-delivery.md)。单文件模式会在本地、无基址、空目录三种环境重走路径；多个互链HTML应交目录包或实现同文档状态，打包脚本不自动合并多个页面。脚本失败需先修复，不能改报告为通过。

## 第一次使用遇到问题

- **已装Skill却读不到Figma**：确认客户端有可用的Figma连接、账号能查看文件，链接包含目标node-id。Skill不会代替连接或自动公开私有文件。
- **没有浏览器或截图能力**：先由AI检查现有工具和项目依赖；缺少时说明缺口，不能把静态代码生成当成已截图验收。
- **字体和原稿不同**：提供可使用的原字体或安装信息；AI需核实实际字体，仓库和ZIP不附带商业字体。
- **只生成第一张页面**：明确提供Section与目标流程，并要求先输出完整页面/关系清单；静态还原后仍要接通链路。

当前本地回归及其限制见[验证范围](VALIDATION.md)。这不是所有客户端和真实课堂的兼容保证。

## 同一个Skill持续迭代

以后修复这条流程的实际问题，先补最小复现和回归，再更新此仓库与CHANGELOG。学生可通过Issues反馈经脱敏的问题；不要提交私有Figma文件、聊天截图、凭据或字体文件。

源码与工具测试可查看[维护说明](references/maintenance.md)。本地测试通过不等于已经过学生或真实项目验证。

## 与官方Skill的关系

这是独立维护的增强层，不是Figma官方发布，也不直接改写官方插件目录。本仓库自己编写的代码与说明使用MIT许可；未复制分发官方Skill正文、图标、字体或设计素材。Figma服务/官方Skill仍适用其自己的条款，见[来源说明](references/upstream.md)。
