# xiangsu100-figma-to-html

像素100 · Figma还原HTML增强版，v0.1.0。

以Figma官方design-to-code工作流为基础，补上交付前的素材、字体、细描边和截图对照检查。由AI读取Skill并执行检查；不会在后台自行运行，也不会绕过Figma登录、浏览器权限或依赖安装。

## 学生安装

有支持Agent Skills的Codex、Claude Code或其他客户端后，在终端安装：

```bash
npx skills add baokeni/xiangsu100-figma-to-html
```

选择自己使用的客户端，安装后按客户端提示重新载入Skill。也可以[下载发布ZIP](https://github.com/baokeni/xiangsu100-figma-to-html/releases/latest/download/xiangsu100-figma-to-html.zip)，把完整的`xiangsu100-figma-to-html`文件夹放入客户端Skill目录；不要只复制SKILL.md。

本Skill允许按任务自动匹配。首次建议明确调用，方便确认：

```text
使用 $xiangsu100-figma-to-html，把这个Figma画板还原为可直接打开的HTML：
【粘贴含node-id的画板链接】
保留原始素材，完成字体、图片、细线检查和同尺寸截图对照后再交付。
```

## 开始前需要什么

- 能读取该设计文件的Figma MCP连接与权限。安装Skill不等于已连通MCP。
- 支持结构化设计上下文和截图的Figma工具。若客户端已有官方`figma-design-to-code`，增强版会配合它使用；没有时先按工具契约/官方说明确认能力。
- Python 3；截图比较脚本需要Pillow。浏览器脚本需要Node.js和目标项目可解析的Playwright。参考[验证说明](references/verification-and-delivery.md)安装最少依赖。
- 使用相同字体所需的实际字体文件或本机安装字体。仓库不附带商业字体或任何学生设计素材。

## 会检查什么

| 检查 | 交付前的要求 |
| --- | --- |
| 图片 | 文件非空、可解码、槽位/比例/裁切正确，运行时不用临时Figma URL |
| 单文件 | 单独复制到空目录和无目录基址预览仍能加载，不能只验证开发服务器 |
| 字体 | 内部名称与版本、混排字重、实际渲染字体；包含用户字体目录检查 |
| 细线 | 描边对齐、渐变、圆角、小数坐标与阴影；不擅自简化 |
| 颜色 | P3/sRGB映射、带ICC截图的正确比较 |
| 截图 | 同画板尺寸、全页和局部对照，发现差异先修再交付 |
| 状态 | 自动检查、AI视觉复查、用户验收分别记录，不承诺未经验证的100%还原 |

辅助脚本不会自动“看懂”设计，也不会替AI批准视觉一致性。它们提供可复查证据；AI仍须看图、定位并修正。

## 脚本入口

```bash
# 先保留目录源稿，再生成可独立打开的副本
python3 scripts/bundle_html.py ./project/source.html --root ./project --output ./project/standalone.html

# 必须先按宿主权限规则配置安全、独立的浏览器执行环境
node scripts/verify_delivery.mjs --html ./project/standalone.html --reference ./project/figma.png --width 393 --height 852 --out ./project/verification --mode standalone

# 正确处理ICC后生成差异与并排图；不输出“还原率”
python3 scripts/compare_screenshots.py ./project/figma.png ./project/verification/render.png --out ./project/verification/comparison
```

命令中的尺寸只是示例，必须换成实际画板尺寸。字体检查用配置文件，格式见验证说明。脚本失败需先修复，不能改报告为通过。

## 同一个Skill持续迭代

以后修复这条流程的实际问题，先补最小复现和回归，再更新此仓库与CHANGELOG。学生可通过Issues反馈经脱敏的问题；不要提交私有Figma文件、聊天截图、凭据或字体文件。

源码与工具测试可查看[维护说明](references/maintenance.md)。本地测试通过不等于已经过学生或真实项目验证。

## 与官方Skill的关系

这是独立维护的增强层，不是Figma官方发布，也不直接改写官方插件目录。本仓库自己编写的代码与说明使用MIT许可；未复制分发官方Skill正文、图标、字体或设计素材。Figma服务/官方Skill仍适用其自己的条款，见[来源说明](references/upstream.md)。
