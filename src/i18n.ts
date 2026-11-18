import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import zh from "./locales/zh.json";

export type SupportedLanguage = "fr" | "en" | "zh";

export function normalizeLanguage(language?: string): SupportedLanguage {
    const normalized = language?.toLowerCase() ?? "";
    if (normalized.startsWith("fr")) return "fr";
    if (normalized.startsWith("en")) return "en";
    if (normalized.startsWith("zh")) return "zh";
    return "en";
}

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            fr: {
                translation: fr,
            },
            en: {
                translation: en,
            },
            zh: {
                translation: zh,
            },
        },
        supportedLngs: ["fr", "en", "zh"],
        load: "languageOnly",
        fallbackLng: "en",
        debug: false,
        interpolation: {
            escapeValue: false,
        },
    });

export default i18n;
