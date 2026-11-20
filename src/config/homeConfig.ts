import type { HomeConfig } from "../types/config";

export const homeConfig: HomeConfig = {
	// 资料卡横幅图（导航 Logo 资料卡第一层）
	// 留空则回退为「站长头像模糊放大」当背景
	avatarBanner: "/assets/images/avatar-banner.webp",

	// 名字
	name: "小慌",

	// 首页展示名字（留空则使用 name）
	displayName: "小慌",

	// 职业/身份标签
	occupation: "[学生 / 软件开发与技术学习]",

	// 个人签名（支持多条，会循环打字+删除效果）
	bio: ["做些有用的小工具，记录正在学习和尝试的东西。"],

	hero: {
		mosaic: {
			rows: 4,
			columns: 6,
			idleVisible: 6,
			seed: 20260814,
			// 首屏六块碎片按 reveal rank 放置，入场后停在这套布局上不再轮换。
			initialLayout: [
				{ x: 0.14, y: 0.305, width: 0.104, height: 0.205 },
				{ x: 0.435, y: 0.18, width: 0.068, height: 0.13, blur: 5.5 },
				{ x: 0.642, y: 0.368, width: 0.047, height: 0.092, blur: 5 },
				{ x: 0.863, y: 0.402, width: 0.097, height: 0.19 },
				{ x: 0.337, y: 0.653, width: 0.159, height: 0.313 },
				{ x: 0.639, y: 0.751, width: 0.116, height: 0.228 },
			],
			scrub: 0.45,
			// 滑动距离整体砍半，同样的滚动量推进更快
			desktopScrollDistance: 3250,
			mobileScrollDistance: 2300,
			desktopDialogueTailDistance: 240,
			mobileDialogueTailDistance: 180,
			desktopMinViewports: 4.05,
			mobileMinViewports: 3.05,
			interactionHold: 0.06,
		},
		contact: { platform: "GitHub", handle: "07xh" },
		sticker: {
			image: "/brand/07xh-ship.svg",
			alt: "07xh 飞船",
			sounds: {
				press: "",
				loosen: "",
			},
		},
		// 拼合完成后的照片态：主图平面倾斜并左移，右侧三张介绍卡片错峰倒下；
		// overlay 会在落位后从下方滑入叠在照片下缘，image 留空不显示；
		// author 填了就在图片右上角显示作者小标牌，留空不显示
		photo: {
			main: {
				image: "/brand/home-main-poster.webp",
				author: "",
			},
			overlay: {
				image: "/brand/home-overlay-poster.webp",
				author: "",
			},
			intro: {
				direction: "Python、工程制图、移动设备与个人软件实践",
				hobby: "持续整理公开项目、学习笔记与开发过程",
				bio: "做些有用的小工具，记录正在学习和尝试的东西。",
			},
		},
		// 左下角角色的想法气泡：首次出现自动冒第一句，之后点击角色逐句弹出，末句后从头循环
		dialogue: {
			enabled: false,
			lines: [
				"这里是小慌的个人空间。",
				"项目的功能状态会随开发进度更新。",
				"文章记录学习过程，也记录遇到的问题。",
			],
		},
		// 玻璃雨珠 + 撞击水花（移动端自动降低密度，尊重 prefers-reduced-motion）
		rain: {
			enabled: true,
			intensity: 0.6,
			// 留空则随主题自动取色（暗色→白 / 浅色→深灰）；也可填 "#7fb0ff" 或 "127,176,255"
			color: "#ffffff",
		},
	},

	// 桌面端影像叙事：背景视差揭示（全屏磨砂玻璃衬底）→ 五幕画面横向叙事
	homeBlinds: {
		enabled: true,
		reveal: {
			backgroundImage: "/brand/xiaohuang-live-poster.webp",
			// 长条横移揭示的入场标题：标题单行显示（版式按 4 字排），
			// 祝福语单行显示（版式按 5 字排），可自由增减条数
			headline: {
				title: "欢迎来到",
				messages: ["夜路有星光", "岁岁皆欢愉", "所念皆星河", "版本无回滚"],
				enterDuration: 0.8,
				messageHold: 2.8,
				messageFlipDuration: 0.75,
			},
		},
		scenes: {
			scrollDistance: 3400,
			// 背景跑马灯胶带：三条斜线按端点位置摆开——
			// 左侧线从底部 1/4 处连到顶部 1/2 处；右侧线从右下角连到顶部左侧 1/4 处；
			// 下方线从右下角连到右侧下方的 1/4 高度处。
			// 文案用完整诗句（古诗与流行句混排）；angle 为倾角（度，正值顺时针）、
			// top/centerX 为中心点落位（%）、thickness 为厚度（px）、speed 为基础速度（px/s）。
			// 胶带会一直匀速滚动（斜纹按半速跟随），横滑时加速、反向横滑时反向滚动
			marquee: {
				tapes: [
					{
						text: "江城如画里，山晚望晴空，两水夹明镜，双桥落彩虹。人烟寒橘柚，秋色老梧桐。谁念北楼上，临风怀谢公。",
						angle: -66,
						top: 50,
						centerX: 37.5,
						thickness: 92,
						speed: 60,
					},
					{
						text: "雾景澄秋，一晚风吹尽朝来雨。夕阳烟树，万里山光暮",
						angle: 37,
						top: 50,
						centerX: 62.5,
						thickness: 74,
						speed: 44,
					},
					{
						text: "年年岁岁花相似，岁岁年年人不同",
						angle: -8,
						top: 87.5,
						centerX: 50,
						thickness: 88,
						speed: 52,
					},
				],
			},
			// 留言墙气泡：同屏去重，每轮不放回；weight 越大越优先出场，缺省按 1 算。
			// 气泡只出文字不出图；文案是 2025—2026 网络热梗与站内老梗混排，梗过时了直接换掉就行
			bubbleMessages: [],
			// 从评论区捞一条真实留言混进上面这池子：滚到影像层才异步取，且只取一次
			commentBubble: {
				enabled: false,
				weight: 4,
			},
			composite: {
				title: "筑一间小屋",
				description: "以代码为梁、热爱为瓦，荒原上筑起一间自己的小屋。",
				alt: "个人空间开场插画",
				date: "2026 / 11 / 19",
			},
			items: [
				{
					title: "校序",
					description: "课表、任务、消息、教务与第二课堂，集中整理校园日常。",
					image: "/project-media/promo-xiaoxu.svg",
					alt: "校序功能全景宣传图",
					date: "2026 / 11 / 09",
				},
				{
					title: "绘序",
					description:
						"从题目条件到几何求解，再到逐步作图；呈现完整的解题与绘图流程。",
					image: "/project-media/promo-draftai.svg",
					alt: "绘序功能全景宣传图",
					date: "2026 / 11 / 18",
				},
				{
					title: "学序",
					description:
						"知到、雨课堂、学习通和 U 校园，统一学习入口与进度核验。",
					image: "/project-media/promo-studyflow.svg",
					alt: "学序功能全景宣传图",
					date: "2026 / 11 / 17",
				},
				{
					title: "词序",
					description: "离线词库、通知复习、学习排程与备份恢复。",
					image: "/project-media/promo-wordflow.svg",
					alt: "词序功能全景宣传图",
					date: "2026 / 11 / 09",
				},
				{
					title: "Reqable Bridge",
					description: "电脑会话转发、手机查看与保存，连接跨设备网络调试流程。",
					image: "/project-media/promo-reqable-bridge.svg",
					alt: "Reqable Bridge 功能全景宣传图",
					date: "2026 / 11 / 12",
				},
				{
					title: "知到学习助手",
					description: "课程、章节、学习任务与进度核验，一处管理。",
					image: "/project-media/promo-zhidao.svg",
					alt: "知到学习助手完整功能宣传图",
					date: "2026 / 11 / 14",
				},
				{
					title: "KingoAssistant",
					description: "课程计划、冲突预检、课程监控与结果核对。",
					image: "/project-media/promo-kingo.svg",
					alt: "KingoAssistant 完整功能宣传图",
					date: "2026 / 11 / 17",
				},
				{
					title: "MomoFlow",
					description: "墨墨今日词表、通知复习、释义与记忆反馈。",
					image: "/project-media/promo-momoflow.svg",
					alt: "MomoFlow 完整功能宣传图",
					date: "2026 / 11 / 18",
				},
			],
			standImages: [],
		},
	},

	// 链接配置
	// 已经预装的图标集：fa7-brands，fa7-regular，fa7-solid，material-symbols，simple-icons
	// 访问https://icones.js.org/ 获取图标代码，
	// 如果想使用尚未包含相应的图标集，则需要安装它
	// `pnpm add @iconify-json/<icon-set-name>`
	links: [
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/07xh",
			color: "#1F6FEB",
		},
		{
			name: "RSS",
			icon: "fa7-solid:rss",
			url: "/rss/",
			color: "#F26522",
		},
	],
};
