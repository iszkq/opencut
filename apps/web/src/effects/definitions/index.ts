import { effectsRegistry } from "../registry";
import { blurEffectDefinition, createBlurEffectDefinition } from "./blur";

const defaultEffects = [
	blurEffectDefinition,
	createBlurEffectDefinition({ type: "blur-soft", name: "柔焦", intensity: 18 }),
	createBlurEffectDefinition({ type: "blur-background", name: "背景虚化", intensity: 34 }),
	createBlurEffectDefinition({ type: "blur-strong", name: "强力模糊", intensity: 62 }),
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
