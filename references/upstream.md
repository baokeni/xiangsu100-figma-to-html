# 上游关系与分发

工作流参考Figma官方的[figma-design-to-code](https://github.com/figma/mcp-server-guide/blob/main/skills/figma-design-to-code/SKILL.md)与[MCP说明](https://github.com/figma/mcp-server-guide)。OpenAI旧实现工作流可参见[figma-implement-design](https://github.com/openai/skills/tree/main/skills/.curated/figma-implement-design)；旧skills仓库已提示迁移至[OpenAI Plugins](https://github.com/openai/plugins)。

本仓库没有复制分发上游Skill全文。自己的增强说明、脚本与合成测试使用MIT；这不改变Figma服务、官方Skill、图标或第三方素材适用的[Figma Developer Terms](https://www.figma.com/legal/developer-terms/)及各自许可。

## 运行时配合

- 环境已有官方figma-design-to-code时，调用设计上下文工具前加载并遵循它。
- 工具可用性随客户端不同，先读取当前工具契约。若官方Skill不在客户端，按照官方说明配置所需读取/截图能力，不假定某个固定命名空间存在。
- 若工具明确要求skillNames/sessionId，按实际返回与技能说明填写；不把其他客户端的参数硬塞给不支持的工具。
- 结构化上下文和原稿截图是主要证据。缺少其中之一，应取得所需材料或标注阻塞；不能从模糊截图臆造精确字体和图层元数据。
- 保留原稿、映射组件、原始素材与矢量几何。不编辑官方插件缓存；后续修正维护本增强版。

## 可携带交付与上游素材规则

优先将源素材原字节下载本地，保留可编辑源稿。用户需要单文件时，增强版可以把已授权使用的原始文件编码成data URL，不抽取或改写SVG路径，不改变素材几何。若运行环境的上游规则明确不允许此包装，交付正确的目录包并解释打开方式；不得违反规则后声称完成单文件。

自动选择增强版不等于自动获得Figma文件访问权，也不授予任何发布、分发原字体/设计稿或修改原稿的权限。
