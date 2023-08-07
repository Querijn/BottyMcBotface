import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");

export default class AutoReact {
    private thinkingUsers: string[];
    private ignoreUsers: string[];
    private thinkingEmojis: Discord.Emoji[] = [];
    private greetingEmoji: Discord.Emoji;
    private sharedSettings: SharedSettings;
    private bot: Discord.Client;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, userFile: string, ignoreFile: string) {
        console.log("Requested Thinking extension..");

        this.sharedSettings = sharedSettings;
        this.bot = bot;

        this.thinkingUsers = fileBackedObject(userFile);
        console.log("Successfully loaded original thinking user file.");

        this.ignoreUsers = fileBackedObject(ignoreFile);
        console.log("Successfully loaded ignore reaction file.");

        this.bot.on("ready", this.onConnect.bind(this));
        this.bot.on("messageCreate", this.onMessage.bind(this));
    }

    public onConnect() {
        this.refreshThinkingEmojis();

        const emoji = this.bot.emojis.cache.get(this.sharedSettings.autoReact.emoji);
        if (emoji instanceof Discord.Emoji) {
            this.greetingEmoji = emoji;
            this.bot.on("messageCreate", this.onGreeting.bind(this));
            console.log("Bot has succesfully loaded greetings.");
        } else {
            console.error(`Unable to find the greeting emoji '${this.sharedSettings.autoReact.emoji}'.`);
        }
    }

    public onToggleDefault(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        this.onToggleThinkingRequest(message, message.author.id);
    }

    public onRefreshThinking(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        message.reply("reloading thinking emojis.");
        this.refreshThinkingEmojis();
    }

    public onToggleReact(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        this.onToggleReactRequest(message, message.author.id);
    }

    private onMessage(message: Discord.Message) {
        // Only react to people not on list
        if (this.ignoreUsers.indexOf(message.author.id) !== -1) return;

        if (!message.content.includes("🤔")) {

            // If it's not the regular thinking emoji, maybe it's one of our custom ones?
            const emojiIds = /<:(.*?):([0-9]+)>/g.exec(message.content);
            if (!emojiIds) return;

            let found = false;
            for (let i = 2; i < emojiIds.length; i += 3) {
                const emojiFound = emojiIds[i];
                if (!this.thinkingEmojis.some((e: Discord.Emoji) => e.id === emojiFound)) {
                    continue;
                }

                found = true;
                break;
            }

            if (!found) return;
        }

        // If original thinking user
        if (this.thinkingUsers.indexOf(message.author.id) !== -1) {
            message.react("🤔");
            return;
        }

        // Otherwise use our custom ones
        const emoji = message.guild!.emojis.cache.filter((x: Discord.Emoji) => x.name !== null && this.isThinkingEmojiName(x.name)).random();
        if (emoji) {
            message.react(emoji);
            return;
        }
    }

    private onToggleReactRequest(message: Discord.Message, authorId: string) {

        const reactIndex = this.ignoreUsers.indexOf(authorId);

        // Add
        if (reactIndex === -1) {
            this.ignoreUsers.push(authorId);
            message.reply("I will no longer react to your messages");
            return;
        }

        // Remove
        this.ignoreUsers.splice(reactIndex, 1);
        message.reply("I will now react to your messages");
    }

    private onToggleThinkingRequest(message: Discord.Message, authorId: string) {

        const thinkIndex = this.thinkingUsers.indexOf(authorId);

        // Add
        if (thinkIndex === -1) {
            this.thinkingUsers.push(authorId);
            message.reply("I will now only reply with default thinking emojis.");
            return;
        }

        // Remove
        this.thinkingUsers.splice(thinkIndex, 1);
        message.reply("I will no longer only reply with default thinking emojis.");
    }

    private onGreeting(message: Discord.Message) {
        if (message.channel instanceof Discord.ThreadChannel) return;
        if (message.author.bot) return;
        const greeting = message.content.toLowerCase();

        const words = [
            // Russian
            "privet", "preevyet", "privyet",
            "zdrastvooyte", "dobraye ootro",
            "привет",
            // ASBO
            "oi", "ey",
            // English
            "hello", "hi", "hey",
            "good morning", "goodmorning",
            "good evening", "goodevening",
            "good night", "goodnight",
            "good day", "goodday", 
            "top of the morning",
            // French
            "bonjour", "salut", "coucou",
            // Spanish
            "buenos días", "buenos dias",
            "buenas tardes", "buenas noches",
            "muy buenos", "hola", "saludos",
            // Portuguese
            "ola", "olá", "boa tarde", "bom dia", "boa noite",
            // Hindi
            "namaste", "suprabhātam",
            "śubha sandhyā", "śubha rātri",
            // Bengali
            "nomoskar", "shubho shokal",
            "shubho oporanno", "shubho shondha",
            // Japanese
            "おはよう　ございます", "こんにちは",
            "ohayou gozaimasu", "konichiwa",
            "ohayō gozaimasu", "konnichiwa",
            "こんばんは", "おやすみ　なさい",
            "konbanwa", "oyasumi nasai",
            // Dutch
            "hallo", "hoi", "hey",
            "goede morgen", "goedemorgen",
            "goedenavond",
            "goedenacht", "goede nacht",
            "goedendag", "houdoe",
            // Montenegrian
            "zdravo", "ćao", "hej",
            "dobro jutro", "jutro",
            "dobro veče", "laku noć",
            "dobar dan", "dobar dan",
            //indonesian
            "selamat pagi",
        ];

        const endChars = [
            " ", "!", ",", ".",
        ];

        // Determine if the greeting is just the greeting, or ends in punctuation and not "his"
        const shouldReact = words.some(x => {
            if (greeting === x) { return true; }

            const endChar = greeting.charAt(x.length);
            return greeting.startsWith(x) && endChars.findIndex(y => y === endChar) !== -1;
        });

        if (!shouldReact) {
            return;
        }

        if (this.ignoreUsers.indexOf(message.author.id) !== -1) {
            return;
        }

        message.react(`${this.greetingEmoji.id}`);
    }

    private isThinkingEmojiName(emojiName: string) {
        return emojiName.toLowerCase().includes("think") || emojiName.toLowerCase().includes("thonk");
    }

    private refreshThinkingEmojis() {
        this.thinkingEmojis = Array.from(this.bot.emojis.cache.filter((x: Discord.Emoji) => x.name != null && this.isThinkingEmojiName(x.name)).values())
    }
}
