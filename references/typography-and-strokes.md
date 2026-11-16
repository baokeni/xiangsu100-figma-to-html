# 字体、行框、细线和色彩

## 字体事实分层

1. Figma声明：family/style、逐段fontWeight/fontSize、字距、lineHeight、文字框、对齐和fills。
2. 字体文件：内部family/PostScript名、版本、weightClass、字形覆盖、文件指纹。文件名不足以确定身份。
3. 浏览器声明：computed style、font-face status。
4. 浏览器实际：实际绘制的family/PostScript名、是否custom font、是否混入后备字体。

四层不能互相代替。`document.fonts.ready`只表示当前字体加载阶段结束，不能证明没有后备字体；CDP实际字体报告也需对准实际含字形的范围。

搜索顺序：项目字体 → 本机通常安装位置（包含用户目录）→ 用户已提供的字体来源。辅助命令：

```bash
python3 scripts/inspect_fonts.py --project ./project --family DIN --family 'PingFang SC' --out ./project/font-inventory.json
```

扫描不完整、容器不支持、文件不可读时，报告覆盖范围，不得说“本机不存在”。脚本不复制/安装字体。若需WOFF2子集，先确认使用范围，再用fontTools等工具保留实际字形与必要布局特性；不要把原字体文件提交到Skill仓库。`embeddingFlags`不是完整授权结论。

## 排版修正

- 同一个Regular样式可能有不同内部字重，按实际值映射font-face；不能固定Regular=400。
- 一个段落可能混用中文字体和数字字体，不能把整段都换成同一字体。
- 自动行高不是一个通用的像素值。核对行框、ascent/descent、baseline、inline/flex对齐与父容器。
- 字号相同，16px与17px行框、0.5px定位仍可能使字形边缘不同。局部补偿要有原稿与当前截图依据，不统一上移所有字。
- 混排字体撑高行盒时先定位原因。某个案例适用的DIN `line-height:0`只是一种条件修复，不是所有页面的默认CSS。
- 保留HTML文字和动态更新；不要把正文导出为图片去取得虚假的零差异。

## 描边与矢量

比较宽度、strokeAlign、圆角、位置/变换、渐变类型及其变换、透明度、shadow/render bounds。CSS border可能无法等价表达原始渐变描边；此时可以保留原始独立背景/描边SVG，文字和交互仍独立为HTML。

静态SVG资产应保持原始根尺寸；在正确槽位使用。阴影导出的外扩应通过容器偏移匹配，不拉伸有阴影的位图。

## 色彩与像素网格

确认文件和截图的色彩空间，尤其Display P3。只在来源确实为P3时映射原生CSS；已经转换的素材不能再次转换。比较带ICC的原稿和无ICC的浏览器PNG前，统一到同一空间并记录假设。

`compare_screenshots.py`默认把无ICC图像标为“假定sRGB”；无法确认时使用`--untagged reject`，先查明来源。脚本拒绝自动缩放不同尺寸的图像。

CSS视口与DPR共同确定物理像素网格。报告视口、DPR与缩放；不要拿DPR2截图直接和1倍图逐像素比较，再把差异称实现错误。

来源：[字体加载](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face)、[设备像素比](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)。
