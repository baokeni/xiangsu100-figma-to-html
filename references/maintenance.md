# 同一Skill的维护与本地打包

## 维护顺序

1. 保留最小失败来源、视口/打开方式和截图。先按[依据表](design-contract.md)核实实际控件、允许变化与验收期望；不要从错误实现倒写测试。
2. 分清来源不足、改动越界、实现遗漏、路径/字体/色彩或确实的渲染边界。先补原创合成回归，再修最窄规则/代码。案例字段、业务、颜色和真实节点留项目，不逐次追加永久个案禁令。
3. 同步版本、README、CHANGELOG与验证范围；将本轮、沿用和未测分开。没有实际跑过不能写通过。
4. 验证源稿/内嵌/最终包，再交付；线上发布按当次用户授权。安装包不自动上传，不把本地候选当成正式Release。

## 本地检查

```bash
python3 -m unittest discover -s tests -v
node tests/config_validation.mjs
node --check scripts/verify_delivery.mjs
node --check scripts/check_config.mjs
node --check scripts/visible_state.mjs
node --check scripts/preflight.mjs
node tests/browser_regression.mjs --channel chrome
node tests/state_regression.mjs --channel chrome --out ../validation/state-evidence
```

使用当前允许的独立浏览器环境，仍遵守macOS宿主规则。state_regression的--out应在仓库外，默认合成临时材料结束即清理。公共测试只含原创合成内容；真实设计/字体/聊天、浏览器profile和机器路径不能进仓库/包。

浏览器检查验证的是资源、配置动作、状态/可见性与失败检测，不是从任意Figma开始的独立还原质量评估。AI视觉复查、实际字体、用户/学生/设备验证分别报告。

## 生成可校验候选ZIP

```bash
python3 scripts/package_skill.py --source . --output ../packages/xiangsu100-figma-to-html.zip
```

只打包Skill入口/元数据、说明、参考、脚本和原创测试；排除缓存与其他目录，拒绝外部/符号链接源文件，输出必须在仓库外。包内package-manifest.json记录版本、相对路径、字节与SHA256；相邻.package.json记录ZIP指纹及published:false。相同源码可重复生成相同ZIP。

交付前实际解压到隔离目录，核对manifest、版本、引用和脚本，再做最小运行检查；这与用户当前客户端真正重新加载Skill是两件事。固定版本包保留，默认下载副本仅在候选验证完成后同步。未来获准发布时核对源码、ZIP、README、Release版本与下载指向一致。

当前没有启用GitHub Actions；[CI示例](ci-checks.example.yml)只是供有权限的维护者参考，不会自行运行。本地验证不等于跨平台或课堂兼容保证。
