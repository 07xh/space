/**
 * 首页实况视频的可见性调度：
 * 初始只有静态 poster；照片进入可见阶段才下载和解码，离开视口/切标签立即暂停。
 * 等浏览器真正提交首帧后再叠上视频，防止黑帧遮住原图。
 */
type LiveKey = "main" | "overlay";

type LiveState = {
	video: HTMLVideoElement;
	key: LiveKey;
	wanted: boolean;
	generation: number;
	frameCallbackId: number | null;
};

export function initHomeHeroLiveMedia(hero: HTMLElement) {
	const abortController = new AbortController();
	const states: LiveState[] = Array.from(
		hero.querySelectorAll<HTMLVideoElement>("video[data-hero-live]"),
	)
		.filter((video) => video.dataset.heroLive === "main" || video.dataset.heroLive === "overlay")
		.map((video) => ({
			video,
			key: video.dataset.heroLive as LiveKey,
			wanted: false,
			generation: 0,
			frameCallbackId: null,
		}));

	const cancelFrame = (state: LiveState) => {
		if (state.frameCallbackId !== null) {
			state.video.cancelVideoFrameCallback?.(state.frameCallbackId);
			state.frameCallbackId = null;
		}
	};

	const stop = (state: LiveState) => {
		state.wanted = false;
		state.generation += 1;
		cancelFrame(state);
		state.video.pause();
		state.video.classList.remove("is-playing");
	};

	for (const state of states) {
		const { video } = state;
		video.addEventListener(
			"playing",
			() => {
				if (!state.wanted) return;
				cancelFrame(state);
				const generation = state.generation;
				if (typeof video.requestVideoFrameCallback === "function") {
					state.frameCallbackId = video.requestVideoFrameCallback(() => {
						state.frameCallbackId = null;
						if (state.wanted && state.generation === generation) {
							video.classList.add("is-playing");
						}
					});
				} else {
					// 旧浏览器没有逐帧回调时，用 playing 事件作为兼容回退。
					video.classList.add("is-playing");
				}
			},
			{ signal: abortController.signal },
		);
		video.addEventListener(
			"error",
			() => video.classList.remove("is-playing"),
			{ signal: abortController.signal },
		);
	}

	const setWanted = (state: LiveState, wanted: boolean) => {
		// GSAP onUpdate 可能每帧触发，不得重复 play() 或设置 src。
		if (state.wanted === wanted) return;
		if (!wanted) {
			stop(state);
			return;
		}
		const { video } = state;
		const source = video.dataset.src;
		if (!source) return;
		state.wanted = true;
		state.generation += 1;
		if (!video.hasAttribute("src")) {
			video.setAttribute("src", source);
		}
		// muted + playsinline：允许大多数浏览器在进入可见区域时无声自动播放。
		// 被浏览器阻止时继续显示海报，不产生未处理的 Promise 拒绝。
		void video.play().catch(() => {
			if (state.wanted) video.classList.remove("is-playing");
		});
	};

	return {
		sync(mainVisible: boolean, overlayVisible: boolean) {
			for (const state of states) {
				setWanted(state, state.key === "main" ? mainVisible : overlayVisible);
			}
		},
		destroy() {
			abortController.abort();
			for (const state of states) {
				stop(state);
				// Swup 离开首页时释放流和解码器；下次挂载仍由 data-src 懒加载。
				if (state.video.hasAttribute("src")) {
					state.video.removeAttribute("src");
					state.video.load();
				}
			}
		},
	};
}
