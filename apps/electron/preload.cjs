const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("opencutDesktop", {
	removeWatermark: (payload) => ipcRenderer.invoke("opencut:remove-watermark", payload),
	selectConversionFiles: () => ipcRenderer.invoke("opencut:select-conversion-files"),
	convertMedia: (payload) => ipcRenderer.invoke("opencut:convert-media", payload),
	transcribeAudio: ({ audio, language }) => ipcRenderer.invoke("opencut:transcribe-audio", { audio, language }),
	exportNativeVideo: ({ clips, ...payload }) => {
		const resolvedClips = clips.map(({ file, ...clip }) => ({
			...clip,
			sourcePath: webUtils.getPathForFile(file),
		}));
		return ipcRenderer.invoke("opencut:export-native-video", {
			...payload,
			clips: resolvedClips,
		});
	},
	exportRenderedVideo: (payload) => ipcRenderer.invoke("opencut:export-rendered-video", payload),
	showInFolder: (filePath) => ipcRenderer.invoke("opencut:show-in-folder", filePath),
});
