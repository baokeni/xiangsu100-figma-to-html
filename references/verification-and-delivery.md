# 运行验证与交付证据

先根据[设计依据与验收表](design-contract.md)写期望。脚本执行配置，不自动推断Figma意图；“能跑”和“按设计还原”分开验收。

## 最少环境与预检

使用已有项目环境，不强制重复安装或修改全局环境。有受管浏览器时可由代理执行等价检查并留证。

```bash
node scripts/preflight.mjs --project ./project --out ./project/verification/preflight.json
```

预检只读本地Python/Pillow/ICC与Playwright依赖，不联网、不安装、不启动浏览器，也不声称Figma已连接。Python需3.9+；Node需满足实际安装的Playwright要求。已安装Chrome可配置channel；否则按项目方式准备独立浏览器。必要依赖在目标项目的虚拟/Node环境安装：

```bash
python3 -m pip install Pillow
npm install --save-dev playwright
npx playwright install chromium
```

这些命令仅在确实缺少时使用；字体子集化另需适用工具/权限。macOS受限终端启动浏览器按宿主权限规则执行；独立临时profile、chromiumSandbox:true，不接管日常会话、不用--no-sandbox。

## 配置：只接受明确支持的字段

```json
{
  "browser": {"channel": "chrome"},
  "requirements": {"fonts": true, "interactions": true},
  "fonts": [{"selector": ".heading", "postScriptName": "Demo-Regular", "custom": true}],
  "interactions": [
    {
      "name": "按已有变体选择分类",
      "action": "click", "selector": "#category-next",
      "expect": [
        {"selector": "#category-next", "attributes": {"aria-pressed": "true"}, "fullyVisible": true},
        {"selector": "#category-next .surface", "css": {"background-color": "black"}},
        {"selector": "#category-next img", "css": {"filter": "brightness(0) invert(1)"}, "fullyVisible": true},
        {"selector": "#category-next .label", "text": "Category", "css": {"color": "black"}},
        {"selector": "#results > article:visible", "count": 1}
      ],
      "checkpoint": {"name": "category-selected", "reference": "references/category-selected.png"}
    }
  ]
}
```

以上字体、色值、文字、数据数量和尺寸只是合成格式示例，不是项目默认。换成依据表的真实期望；没有对应原稿的checkpoint不要填reference，标记为实现检查。不要为通过而把期望改成错误实现的值。

### 字段与语义

| 范围 | 支持及限制 |
| --- | --- |
| 顶层 | browser、fonts、interactions、requirements、captureFullPage、allowRemoteAssets；未知字段明确blocked |
| browser | channel或executablePath二选一；不接受任意启动参数或日常profile |
| 动作 | name、action、selector、timeoutMs、expect、fonts、checkpoint；action为click/press/scroll，不支持force |
| press / scroll | press需key；scroll可给top/left，对指定滚动容器操作 |
| expect | selector、visible、text、disabled、scrollTop、scrollLeft、urlHash、urlIncludes、attributes、css、count、fullyVisible |
| attributes | 字符串精确匹配；null表示属性不存在，布尔属性用真实字符串/不存在检查 |
| css | 字符串值，支持kebab-case或camelCase属性名；按浏览器计算值比较，规范化普通字面色值/单位。复杂相对单位/继承/URL以明确计算值配置，不等价完整CSS语义解析 |
| count | 非负整数。数量不等于1时单独做count-only期望；检查可见结果可用Playwright的:visible选择器 |
| 文字 / 几何 | text去首尾空白后完整匹配，默认还检查非零有效透明度、文字范围和视口/祖先裁切。fullyVisible:true另要求目标元素边界完整可见 |
| 显式数据检查 | fullyVisible:false仅供明确的非视觉数据期望，会写入coverage和warnings；不能用来放行本应显示的文字 |
| 隐藏 | visible:false表示不存在或常规布局不可见，不与text/css/属性等混用；有意隐藏源内容不要求补字 |
| URL / 滚动 | urlHash精确匹配、urlIncludes子串；scrollTop/Left容差1 CSS px |
| 字体 | selector、postScriptName/familyName、custom、allowFallback；默认实际所有字体均须匹配。选择器应为唯一原生CSS目标，混排分段核对 |
| checkpoint | name仅字母/数字/短横线/下划线；reference相对配置文件，核对像素尺寸后仍需运行比较并看图 |

expect可以是对象或数组；每条期望须有selector或URL依据。未知字段、错误类型、空期望、歧义数量和缺失requirements会在启动浏览器前明确报配置错误。不能写未支持的style/checked等字段并以为已检查。

文本可见性只检查所指定目标的常规矩形裁切与透明度，不证明复杂mask/clip-path、所有遮挡、对比度或实际可读性完全正确。仍须看图；点击命中仍须正常指针操作。CSS背景/mask会记录请求/声明，正确槽位及复杂资源另核对。

## 执行和覆盖

```bash
node scripts/verify_delivery.mjs --html ./project/standalone.html --reference ./project/figma.png --width 393 --height 852 --out ./project/verification/browser --mode standalone --config ./project/checks.json
```

- width/height是原画板CSS整数尺寸，dpr默认1。PNG像素网格不符会失败，不自动拉伸。不同尺寸的Frame单独截图，再测链路。
- standalone模式在本地文件、无目录基址、空目录独立文件三种方式重走配置路径；folder模式验证指定目录入口，需传实际解压后的文件，不代表单文件兼容。
- 检查图片解码、请求失败、JS异常、页面级横向溢出、已配置的实际字体与动作状态；动作失败停止该路径，不把后续步骤算已访问。
- 输出automated-report.json、初始/关键状态截图与资源/几何JSON。report.sourceSnapshot只记录输入HTML和参考图指纹，目录依赖另用打包manifest核对。
- coverage、warnings明确列出未配置字体/交互、属性/样式/数量/可见性覆盖与显式数据检查。requirements可将本次必须项变为配置门；未配置不能当检查通过。
- automated_checks_passed只代表已配置自动项通过；visualReview仍pending。AI按依据表和截图完成视觉复查，再独立记录用户验收，不改机器报告伪装视觉已通过。

## 多状态与完整性

按页面/状态/关系清单从起点实测，覆盖分支、取消、反向、返回和滚动/筛选保留。Tab内容可能保持，也可能变化，以来源为准；检查已有完整变体。收藏用两个条目验证隔离、取消与已有相关列表同步，不凭标签创造新页面。

首屏不能证明横滑、折叠、Tab后的完整性。按用户路径滚动到相应内容，检查文案、字体、几何和图层命中；对被截内容先执行scroll，再做可见文字检查。只用textContent、DOM点击或force不能替代视觉/指针验收。

## 同尺寸与透明图对照

```bash
python3 scripts/compare_screenshots.py ./project/figma.png ./project/verification/browser/render.png --out ./project/verification/comparison
# 仅当原稿/当前图含透明度，明确相同背景；不得自动猜白底
python3 scripts/compare_screenshots.py ./project/transparent-reference.png ./project/transparent-render.png --background '#ffffff' --out ./project/verification/transparent-comparison
```

脚本保留输入文件，按ICC转到sRGB；无ICC默认标注假定sRGB，可用--untagged reject拒绝猜测。透明输入不指定共同背景时明确停止；提供背景后保留alpha、做色彩转换并在sRGB编码空间合成，写明背景与方法。如果设计依赖P3合成/复杂混合，需先取得同背景、同合成范围的参考，不将此简单合成当所有绘制流程的精确替代。

输出各50%的overlay-50.png、difference.png、difference-x4.png、side-by-side.png和comparison.json。尺寸不符拒绝自动缩放；不移动、模糊或拉伸图像来降低差异。数值仅诊断，不计算还原率。

AI实际查看全页/状态与关键局部，按大区块→间距→文本/换行→图标/层级→颜色/细线/阴影修正；修改后重截并重做对照。无可修差异记录结果，不虚构修改。截图仅代表对应源码和视口，不能掩盖新改代码。

## 交付记录

记录来源/范围表、已实现/已读/未知状态、目录/单文件入口、素材/实际字体、当前源码/包版本、每条已测链路、原稿/当前图/叠图/差异图及剩余项。没有参考或未测字体/业务/动效/设备必须单列。原稿刻意隐藏不算缺失；模拟实现不冒称Figma事实。

只做静态/机器检查不能写“截图验收完成”。工具阻塞时继续可独立完成部分并说明缺口；达到请求范围后交付，不默认增加真实业务接入、线上发布或学生测试。
