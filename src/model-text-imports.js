// Keep the hundreds of dynamic import entries out of the initial page bundle.
export const files = import.meta.glob("./model-texts/*.js");
