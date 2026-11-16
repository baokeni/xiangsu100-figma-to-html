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

交互的`expect.text`会去除首尾空白后完整匹配，不做子串放行；状态默认等待最多5秒，可在该动作设置`timeoutMs`。选择器须指向唯一目标。

```bash
node scripts/verify_delivery.mjs --html ./project/standalone.html --reference ./project/figma.png --width 393 --height 852 --out ./project/verification --mode standalone --config ./project/checks.json
```

- 参数的width/height是原画板CSS尺寸，dpr默认1，可用`--dpr 2`显式设置。
- 默认截取画板视口；需要完整长页且原稿覆盖相同范围时，在配置设置`captureFullPage:true`。PNG原稿与当前截图像素网格不同时会报错，不自动缩放。
- 脚本从`--project`或HTML所属项目解析Playwright，不含本机绝对模块路径。
- 检查img解码、网络/CSS/字体加载失败、JS异常、文档溢出、配置的实际字体与交互。
- standalone模式额外把HTML单独复制到空目录，并在无目录基址下预览；folder模式不能证明单文件兼容，需自行核对实际解压目录。
- 产出render.png、场景资源/几何JSON和automated-report.json。`automated_checks_passed`只代表自动检查通过，visualReview始终pending。
- 字体未配置时会明确标注not_configured，必须补实际字体检查或说明缺口；不能借自动通过跳过Skill字体检查门。
- CLI不是完整CSS语义解析器；懒加载、交互后资源和复杂应用须补场景验证，不能靠一个静态加载检查证明全应用正确。

## 同尺寸视觉复查

```bash
python3 scripts/compare_screenshots.py ./project/figma.png ./project/verification/render.png --out ./project/verification/comparison
```

输出同色彩空间的并排、差异、放大差异图。代理必须实际打开图像，查看全页以及文字、图片、细线密集的局部；数值仅诊断，不自动判断通过，不输出“还原率”。不同尺寸直接停止，不自动拉伸。

## 交付记录的最小内容

```text
来源：目标画板/版本，原稿截图和尺寸。
实现：入口、打开方式、可编辑源稿、实际素材和字体。
已检查：机器检查项目与结果、真实运行的交互、AI实际查看的截图。
已修正：本轮具体差异与证据。
仍有差异：位置/原因、未验证状态和设备范围。
状态：自动检查 / AI视觉复查 / 用户验收分别填写。
```

只有脚本或静态检查，不能写“已截图验收”。无法取得可靠设计数据或运行浏览器时写明阻塞与已完成部分，继续可独立完成的工作，不冒称完成。达到当前用户要求后停止；不把真实用户测试、线上发布或埋点接入当成默认附加任务。
