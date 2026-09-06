# 国科大课表 · Android

离线 Android 课表应用，使用国科大公开课程数据。首页查看课表，点右上角 **+** 选课。

## 功能

- 内置 2026–2027 秋季学期 2,978 门课程、排课地点和教学大纲。
- 设置学期开始日期，按周一至周日计算教学周，打开或返回 App 时自动定位当前周。
- 手动翻周、回到本周、日期表头及今日标记；手机端没有全学期叠加视图。
- 模拟选退课、冲突提醒、多方案、本地保存、JSON 备份与导入。
- 按课程编码批量添加：粘贴多行编码或用空格、逗号、分号分隔，核对匹配结果后勾选加入；自动去重，同编号多条记录需手动选择，冲突统一确认。
- 导出独立 HTML 课表，离线打开后仍可切换教学周。

不连接个人教务账号，不向学校提交选课，也不受实际选课人数限制。

## 安装

在本仓库的 **Releases** 中下载 APK，传到 Android 手机安装。系统要求 Android 7.0 及以上，并需要支持现代 JavaScript 的 Android System WebView。

同签名的新版本可以直接覆盖安装。自行构建使用自己的签名，与发布版签名不同时不能直接覆盖；更换安装前先在 App 中备份 JSON 方案。

## 源码结构

这是独立的 Android 项目，没有电脑网站服务器。App 使用 Capacitor 和 Android WebView，因此 `src/` 中的 HTML、CSS 和 JavaScript 也是 App 的源码，构建时会一起内置到安装包中。

```text
android/           Android 工程、系统文件保存插件、应用图标
src/               App 界面、课表、学期日期及 HTML 导出逻辑
data/courses.json  内置课程快照
scripts/           离线资源打包与 APK 构建
tests/             课程逻辑和手机界面测试
```

## 构建

准备 Node.js 22+、Python 3.9+、JDK 21、Android SDK Platform 36 和 Build Tools 36.0.0。将 `JAVA_HOME` 和 `ANDROID_HOME` 指向本机安装目录。

```sh
npm ci
npm run build:apk
```

输出位于 `dist/ucas-timetable-android-v1.1.0.apk`，同目录包含 `SHA256SUMS.txt`。首次构建会在 `.signing/` 生成个人签名密钥，后续构建会复用。密钥和构建产物不进入 Git。

使用已有签名时设置 `UCAS_KEYSTORE_FILE`、`UCAS_KEYSTORE_PASSWORD`（或 `UCAS_KEYSTORE_PASSWORD_FILE`），别名默认为 `planner`，可通过 `UCAS_KEY_ALIAS` 修改。签名密码与密钥密码需相同。

也可以运行 `npm run sync:android`，再用 Android Studio 打开 `android/` 调试。

## 验证

```sh
npm test
npm run test:app
```

手机界面测试使用本机 Google Chrome，临时服务器只提供打包后的 App 资源。已覆盖日期与周次边界、启动和返回时定位、旧版方案兼容、离线选课、课程大纲及多种手机尺寸。原生系统文件选择器尚未在 Android 真机上验证。

## 数据与许可

项目原创代码采用 MIT 许可证。第三方代码、图标和课程数据不因此重新授权，详见 `THIRD_PARTY_NOTICES.md`。

课程快照采集于 2026-09-05，来自国科大公开开课页面，不代表学校官方应用。课程变更以学校发布的信息为准。

## 发布

源码提交到 Git，APK 与校验文件上传到 GitHub Release，不把安装包放进源码历史。当前 Release 标签为 `v1.1.0`，正文见 `RELEASE_NOTES.md`。
