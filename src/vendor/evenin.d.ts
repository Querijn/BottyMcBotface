declare module "evenin" {
    export interface Language {
        name: string;
        url: string;
        location: string;
        greetings: Greeting[];
    }

    export interface Greeting {
        language: Language;
        phrase: string;
        explanation: string;
    }

    /**
     * Returns whether or not the specified text contains a greeting. 
     * @param {string} text the text to search in
     * @returns {boolean} whether or not the text contains a greeting
     */
    export function hasGreeting(text: string): boolean;

    /**
     * Checks if the specified text is found as an exact greeting. Note that this is
     * an case-insensitive match and does not trim the input string.
     * @param {String} text the greeting to search for
     * @returns {boolean} whether or not the text is a greeting
     */
    export function isGreeting(text: string): boolean;

    /**
     * Finds all greetings across all supported languages that are exactly the given
     * input. Case-insensitive comparison is used, but inputs are not trimmed or normalized.
     * @param {String} text the greeting to search for
     */
    export function findGreetings(text: string): Greeting[];

    /**
     * Finds all greetings that start with the specified substring. Case-insensitive comparison
     * is used, but inputs are not trimmed or normalized.
     * @param {String} text the prefix to search for
     */
    export function matchGreetings(text: string): Greeting[];

    /**
     * Finds the language with the specified name. The language name needs to match exactly, 
     * barring case difference.
     * @param {string} language the language name
     */
    export function getLanguage(name: string): Language | null;
}