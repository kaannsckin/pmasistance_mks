// Google AI Studio ortamının window'a enjekte ettiği API (AIAssistant.tsx kullanıyor)
interface Window {
  aistudio?: {
    hasSelectedApiKey?: () => Promise<boolean>;
    openSelectKey?: () => Promise<void>;
  };
}
