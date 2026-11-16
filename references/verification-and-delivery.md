# 运行验证与交付证据

## 准备最少依赖

使用项目自己的环境，不擅自修改全局环境：

```bash
# 项目Python虚拟环境中
python3 -m pip install Pillow

# 项目已有Node环境中
npm install --save-dev playwright
npx playwright install chromium
```

如果工具可直接使用已连接的受管浏览器，也可以由代理执行等价检查并保存证据；不要为了跑辅助脚本强制重复安装浏览器。macOS受限执行环境必须先按宿主规则获取浏览器执行权限，保持chromiumSandbox:true与独立临时profile。不要在受限沙箱内先试启动一次，也不以--no-sandbox解决权限问题。

## 浏览器检查配置

以下选择器、字体名和尺寸仅示例，必须换成项目实际值。`channel:chrome`仅在本机已安装且允许独立启动时使用；省略browser则使用项目Playwright的浏览器。

```json
{
  "browser": { "channel": "chrome" },
  "fonts": [
    { "selector": ".price .digits", "postScriptName": "DIN-Regular", "custom": true },
    { "selector": ".title", "postScriptName": "PingFangSC-Medium" }
  ],
  "interactions": [
    { "name": "领取一次后不可重复领取", "action": "click", "selector": "#claim", "expect": { "selector": "#claim", "disabled": true, "text": "已领取" } }
  ]
}
```

字体检查默认要求该选择器下实际绘制的所有字体符合期望。若文字本来混排，拆成各字体范围检查；只有有意允许后备字形时才设置`allowFallback:true`。不用泛化选择器覆盖整个页面并只检查出现过一个目标字体。

交互的`expect.text`会去除首尾空白后完整匹配，不做子串放行；状态默认等待最多5秒，可在该动作设置`timeoutMs`。选择器须指向唯一目标。每一步失败即停止该条路径，不能把后续状态记为已走到。

```bash
node scripts/verify_delivery.mjs --html ./project/standalone.html --reference ./project/figma.png --width 393 --height 852 --out ./project/verification --mode standalone --config ./project/checks.json
```

- 参数的width/height是原画板CSS尺寸，dpr默认1，可用`--dpr 2`显式设置。
- 默认截取画板视口；需要完整长页且原稿覆盖相同范围时，在配置设置`captureFullPage:true`。PNG原稿与当前截图像素网格不同时会报错，不自动缩放。
- 脚本从`--project`或HTML所属项目解析Playwright，不含本机绝对模块路径。
- 检查img解码、网络/CSS/字体加载失败、JS异常、文档溢出、配置的实际字体与交互。
- standalone模式额外把HTML单独复制到空目录，并在无目录基址下预览；三种场景都会重放配置的整条交互路径。folder模式只验证指定目录中的入口与路径，需把实际解压后的入口传给脚本，不能证明单文件兼容。
- 产出render.png、场景资源/几何JSON和automated-report.json。`automated_checks_passed`只代表自动检查通过，visualReview始终pending。
- 字体未配置时会明确标注not_configured，必须补实际字体检查或说明缺口；不能借自动通过跳过Skill字体检查门。
- 脚本检查每个已配置动作期间的加载错误及动作后的图片、横向溢出；仍不是完整CSS语义解析器。未走过的分支、延迟/悬停资源、背景素材的槽位、固定区和复杂应用须补场景验证。

## 多页面/多状态检查配置

先按 [intake-and-prototype.md](intake-and-prototype.md) 建立页面与关系清单。脚本执行配置，不自动读取连线，也不自动证明全部分支覆盖。每个独立起点/分支使用独立配置与输出目录，勿依赖上一轮浏览器状态。

动作支持`click`、`press`（传key）与`scroll`（对selector指向的滚动元素设置top/left）。`expect`可为对象或对象数组：

```json
{
  "interactions": [
    { "name": "打开筛选", "action": "click", "selector": "#filter", "expect": { "selector": "#filter-dialog" }, "checkpoint": { "name": "filter-open", "reference": "references/filter-scene.png" } },
    { "name": "取消筛选", "action": "click", "selector": "#cancel", "expect": { "selector": "#filter-dialog", "visible": false } },
    { "name": "进入详情", "action": "click", "selector": "#item-1", "expect": { "selector": "#detail-title", "text": "详情", "urlHash": "#detail" }, "checkpoint": { "name": "detail" } },
    { "name": "返回来源", "action": "click", "selector": "#back", "expect": [{ "selector": "#results", "scrollTop": 120, "urlHash": "#list" }, { "selector": "#filter-label", "text": "已筛选" }], "checkpoint": { "name": "return" } }
  ]
}
```

这是格式示例，不是一套可直接套用的链路；120也必须换成实际准备和预期值。按项目补上滚动/筛选准备动作。`urlHash`精确匹配，`urlIncludes`适合不同目录基址下的普通HTML路由。`visible:false`检查弹层关闭；`scrollTop/scrollLeft`允许1 CSS px误差。每步可用`fonts`声明当前状态的实际字体期望，格式与初始`fonts`一致；初始字体通过不代表未检查的后续页面也通过。

`checkpoint.name`只能含字母、数字、下划线和短横线。产出带打开场景/步骤编号的PNG；可选`reference`路径相对配置文件，脚本只核对像素尺寸，仍需逐张运行比较工具、看图修正。初始render.png始终是交互前截图。没有reference或fonts的状态不能说已完成该状态的原稿/字体对照。

每个运行实例使用固定width/height；设计中各页尺寸不同，应另以对应视口执行该页检查，链路本身再按目标演示视口验证。截图模式默认视口，长页全页截图不能代替固定导航、吸底区域与局部滚动行为检查。

## 同尺寸视觉复查

```bash
python3 scripts/compare_screenshots.py ./project/figma.png ./project/verification/render.png --out ./project/verification/comparison
```

输出`overlay-50.png`（原稿与网页各占50%）、`difference.png`、`difference-x4.png`和`side-by-side.png`。先统一到sRGB并对齐像素网格，不移动、拉伸或模糊图像来压低差异。透明小图应与同范围/同背景的截图比较，必要时先按可复现规则合成背景并保留原文件。

代理必须实际打开原稿、网页、叠图和增强差异图，检查明显双影、错位、尺寸差异和密集局部。按“大区块尺寸 → 间距 → 文本基线与换行 → 图片/图标/层级 → 圆角、颜色、阴影”的顺序修正一轮；还要核实真实字体、SVG原始来源、横向溢出、固定区和滚动区。查看SVG存在不等于已确认来源节点及槽位正确。

修正后生成第二轮当前网页截图、50%叠图和增强差异图，再检查受影响区域。分别用`round-1`、`round-2`等目录保存证据，报告必须指向最终版本。首轮无可修问题时记录检查结果，不为凑轮次伪造修改；仍有明确错误应继续修正或说明阻塞。不得交付旧截图掩盖新代码。数值仅诊断，不输出“还原率”。不同尺寸直接停止，不自动拉伸。

## 交付记录的最小内容

```text
来源：Frame/Section、版本、Flow起点；所有目标页面/状态清单与原稿尺寸。
实现：入口、打开方式、可编辑源稿、实际素材和字体。
已检查：机器检查结果、逐页/状态视觉对照、实际走过的每条链路及返回状态。
证据：各状态的Figma原图、当前网页截图、50%叠图、增强差异图、最终轮次。
已修正：本轮具体差异与证据。
仍有差异：位置/原因、未实现页面/动作、未测试分支/字体/动效与设备范围。
状态：自动检查 / AI视觉复查 / 用户验收分别填写。
```

只有脚本或静态检查，不能写“已截图验收”。无法取得可靠设计数据或运行浏览器时写明阻塞与已完成部分，继续可独立完成的工作，不冒称完成。达到当前用户要求后停止；不把真实用户测试、线上发布或埋点接入当成默认附加任务。
