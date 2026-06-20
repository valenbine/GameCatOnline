# GameCatOnline

GameCatOnline 是一个面向 PC 浏览器的多平台在线怀旧游戏平台，包含前台游戏站点和后台管理系统。管理员可以上传 ROM、维护封面和操作说明、控制上架状态与精选排序；玩家可以直接在浏览器中进入详情页和游玩页。

## 当前能力

- 前台游戏列表、详情页、游玩页
- 后台单管理员登录与游戏管理
- 支持平台：`NES`、`GB`、`GBC`、`GBA`、`SFC/SNES`、`MD/Genesis`、`PCE`、`Arcade(FBNeo)`、`MAME 2003 Plus`、`CPS1`、`CPS2`
- EmulatorJS 本地自托管与多核心映射
- 每游戏独立键位配置，保存在 `localStorage`
- 本地即时存档，支持 10 个槽位和截图预览
- 首页精选位、分页、搜索、排序
- 后台批量上架、批量下架、批量加入精选
- 后台自动封面截图、封面质量状态、人工复核和手动覆盖
- ROM 与封面上传大小限制、格式校验、中文报错

## 技术栈

- 前端：React 18、Vite、TypeScript、React Router
- 后端：Express、TypeScript
- 数据库：SQLite
- 模拟器：EmulatorJS

## 项目结构

```text
.
├── client/   # 前端站点
├── server/   # API、静态托管、SQLite、上传处理
└── package.json
```

## 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 构建前后端

```bash
npm run build
```

### 3. 启动服务

```bash
npm start
```

默认监听端口：`3001`

健康检查：`/api/health`

## 开发命令

```bash
# 启动 server 开发模式
npm run dev

# 单独启动前端 Vite
npm run dev:client

# 单独启动后端 watch
npm run dev:server

# 运行测试基线
npm test

# 完整构建
npm run build
```

## 后台管理

- 后台入口：首页右上角 `管理员后台`
- 默认管理员密码：`admin123`
- 可通过环境变量覆盖：`ADMIN_PASSWORD`
- 登录状态 Cookie：`fc_admin_session`

## 上传与数据目录

- 数据库：`server/data/game-cat-online.db`
- ROM 上传目录：`server/uploads/roms/`
- 封面上传目录：`server/uploads/covers/`

当前服务端会对上传进行限制：

- ROM 文件：扩展名校验，大小上限 `256 MB`
- 封面文件：扩展名校验，大小上限 `8 MB`

## 体验约束

- 当前版本以 PC 网页端为主
- 小屏触屏设备会跳转到 `/unsupported`
- `开始游戏` 会先请求浏览器全屏，再进入游玩页
- 街机类游戏首次启动时会显示解压提示，启动时间可能略长

## 测试覆盖

当前仓库已包含一组基础测试：

- 前端查询参数序列化
- EmulatorJS 平台核心映射
- 上传错误映射
- 游戏序列化字段输出

运行方式：

```bash
npm test
```

## GitHub 仓库

远程地址：`https://github.com/valenbine/GameCatOnline.git`
