# 像素100 · Figma还原HTML

**v0.3.0。** 仓库默认分支与Release安装包可能不是同一版本，安装后请核对SKILL.md的metadata.version；课堂固定版本使用对应Release的ZIP。发布状态以GitHub页面为准。

这是官方Figma design-to-code流程的独立增强层。先明确设计依据、改动范围和验收期望，再还原HTML、补范围内轻交互，完成原始素材/真实字体检查和同尺寸对照。安装Skill不等于已连接Figma，也不会在后台自动运行检查。

## 安装与更新

[下载 v0.3.0 安装包](https://github.com/baokeni/xiangsu100-figma-to-html/releases/download/v0.3.0/xiangsu100-figma-to-html.zip) · [查看版本说明](https://github.com/baokeni/xiangsu100-figma-to-html/releases/tag/v0.3.0) · [始终下载最新版](https://github.com/baokeni/xiangsu100-figma-to-html/releases/latest/download/xiangsu100-figma-to-html.zip)

解压完整的xiangsu100-figma-to-html文件夹，放到客户端Skill目录，不要只复制SKILL.md或多套一层目录。Codex通常使用`~/.codex/skills/`，设置了CODEX_HOME则使用其下skills；Windows通常为`%USERPROFILE%\.codex\skills\`。替换旧版前保留自己的定制，更新后按客户端提示重新加载。其他支持Agent Skills的客户端使用其对应目录/本地安装方式。

也可以通过仓库安装，按安装器提示选择客户端：

```bash
npx skills add baokeni/xiangsu100-figma-to-html
```

仓库安装读取已上传的源码；下载[Release安装包](https://github.com/baokeni/xiangsu100-figma-to-html/releases)时选择所需版本。尚未上传的本地改动不会自动出现在这两种安装方式中，候选ZIP可按上面的解压方式试用。

## 学生开始使用

一个含node-id且当前账号能查看的Frame/Section链接即可开始。工具能读出reactions时无需再交Prototype播放链接；行为不可读时AI才补问。无需公开私有文件或重画每个简单选中态。

```text
使用 $xiangsu100-figma-to-html 还原这个Figma Frame或Section：
【设计链接】
使用原生HTML/CSS/JS，可直接打开。已有工程则沿用其技术栈。
先定位页面/控件，写清设计依据、允许改动、必须保留和验收期望，再逐页还原。
按原稿复用完整状态变体；可补选中/重置/收藏等必要本地模拟，不擅自新增业务页面。
保留原始素材，按原Frame尺寸截图，生成50%叠图和增强差异图，修正后复查。
交付可打开入口、检查覆盖、对照图和剩余项。
```

尺寸能读取时AI自行读取；已有Prototype/特殊展示尺寸或明确差异内容可一并提供。输入与多页面说明见[页面/原型](references/intake-and-prototype.md)，改动判断见[设计依据与验收表](references/design-contract.md)。范围清楚就继续，不为每个开关重复请求批准。

## AI会执行什么

1. 根据用户/来源定位实际控件，区分主导航、分类、详情Tab和页面；列出允许变化及保留项，不能按自己写出的实现编验收标准。
2. 读取高精度设计/截图与全部目标状态；区分未读取、真实缺失和设计有意隐藏。
3. 原图/原SVG优先复用，文字/列表/交互为HTML；完整迁移底色、图标、标签、描边等状态，颜色取当前设计。
4. 检查实际字体、文本可见性、细线、ICC/透明度及原始几何；测试正常/取消/反向/返回，不以高亮或toast代替行为。
5. 目录版、需要的独立单文件、同尺寸截图与对照分别验证；未配置/未知/模拟和用户验收分开记录。

## 环境和工具

需要可读的Figma连接/截图工具；本地脚本使用Python3.9+、Pillow、满足实际Playwright要求的Node和可用独立浏览器。已经具备时不重复安装；也可使用宿主受管浏览器做等价检查。预检不会安装或启动浏览器，也不代替确认Figma连接。

```bash
node scripts/preflight.mjs --project ./project --out ./project/verification/preflight.json
python3 scripts/bundle_html.py ./project/source.html --root ./project --output ./project/standalone.html
node scripts/verify_delivery.mjs --html ./project/standalone.html --reference ./project/figma.png --width 393 --height 852 --out ./project/verification/browser --mode standalone --config ./project/checks.json
python3 scripts/compare_screenshots.py ./project/figma.png ./project/verification/browser/render.png --out ./project/verification/comparison
```

换成真实视口、字体和状态配置。未知字段会报错；支持attributes/css/count与关键文字/元素可见性。覆盖和warnings必须查看，自动通过不代表所有检查已配置。透明图片需明确共同背景，否则比较停止。详细配置和限制见[验证说明](references/verification-and-delivery.md)。

## 常见边界

- 接口、真实报名/账号与未提供的业务页面不自动补；没有原稿的状态只记本地实现检查。
- 没有可用字体时说明后备与差异；仓库/ZIP不含商业字体和学生素材，字体读取不等于授权分发。
- 无浏览器/截图能力时说明缺口；不能把静态代码或结构校验当视觉验收。
- 同尺寸叠图与数值不能证明100%还原。真机、学生实际使用和用户验收都需要另有证据。
- 原始资源、普通HTML和复杂工程的打包边界见[素材说明](references/assets-and-portability.md)。

## 维护同一个Skill

以后先记录最小复现和来源预期，再补一般规则/原创回归。不要将特定页面颜色、字体、业务标签变成所有项目默认。当前验证范围见[VALIDATION](VALIDATION.md)，源码/ZIP一致打包方式见[维护说明](references/maintenance.md)。发布必须符合当次授权，不因本地通过而自动上传。

自编代码与说明为MIT；不改写官方插件缓存，不分发官方Skill正文、真实设计、字体或本机资料。[官方流程关系与边界](references/upstream.md)。
