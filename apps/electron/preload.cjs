const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("opencutDesktop", {
	removeWatermark: (payload) =>
		ipcRenderer.invoke("opencut:remove-watermark", payload),
	selectConversionFiles: () =>
		ipcRenderer.invoke("opencut:select-conversion-files"),
	convertMedia: (payload) =>
		ipcRenderer.invoke("opencut:convert-media", payload),
	saveProjectPackage: ({ projectName, data }) =>
		ipcRenderer.invoke("opencut:save-project-package", { projectName, data }),
	openProjectPackage: () => ipcRenderer.invoke("opencut:open-project-package"),
	transcribeAudio: ({ audio, language }) =>
		ipcRenderer.invoke("opencut:transcribe-audio", { audio, language }),
	ttsStatus: () => ipcRenderer.invoke("opencut:tts-status"),
	downloadTtsModel: ({ mirrorUrl } = {}) =>
		ipcRenderer.invoke("opencut:tts-download-model", { mirrorUrl }),
	generateTts: ({ text, speakerId, speed }) =>
		ipcRenderer.invoke("opencut:tts-generate", { text, speakerId, speed }),
	cloudTtsStatus: () => ipcRenderer.invoke("opencut:tts-cloud-status"),
	saveCloudTtsApiKey: ({ apiKey }) =>
		ipcRenderer.invoke("opencut:tts-cloud-save-key", { apiKey }),
	generateCloudTts: ({ text, model, voice }) =>
		ipcRenderer.invoke("opencut:tts-cloud-generate", { text, model, voice }),
	selfHostedEdgeTtsStatus: () =>
		ipcRenderer.invoke("opencut:tts-self-hosted-edge-status"),
	saveSelfHostedEdgeTtsConfig: ({ endpoint, apiKey }) =>
		ipcRenderer.invoke("opencut:tts-self-hosted-edge-save-config", {
			endpoint,
			apiKey,
		}),
	generateSelfHostedEdgeTts: ({ text, voice, speed, pitch, style }) =>
		ipcRenderer.invoke("opencut:tts-self-hosted-edge-generate", {
			text,
			voice,
			speed,
			pitch,
			style,
		}),
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
	exportRenderedVideo: (payload) =>
		ipcRenderer.invoke("opencut:export-rendered-video", payload),
	showInFolder: (filePath) =>
		ipcRenderer.invoke("opencut:show-in-folder", filePath),
});
