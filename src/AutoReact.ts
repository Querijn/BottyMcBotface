import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");
import { CommandHandler } from "./CommandHandler";

export default class AutoReact extends CommandHandler {
    private thinkingUsers: string[];
    private ignoreUsers: string[];
    private thinkingEmojis: Discord.Emoji[] = [];
    private greetingEmoji: Discord.Emoji;
    private sharedSettings: SharedSettings;
    private bot: Discord.Client;

    constructor(sharedSettings: SharedSettings, userFile: string, ignoreFile: string) {
        super();
        console.log("Requested Thinking extension..");

        this.sharedSettings = sharedSettings;

        this.thinkingUsers = fileBackedObject(userFile);
        console.log("Successfully loaded original thinking user file.");

        this.ignoreUsers = fileBackedObject(ignoreFile);
        console.log("Successfully loaded ignore reaction file.");
    }

    public onReady(bot: Discord.Client) {
        this.bot = bot;
        console.log("Thinking extension loaded.");

        this.refreshThinkingEmojis();

        const emoji = bot.emojis.get(this.sharedSettings.autoReact.emoji);
        if (emoji instanceof Discord.Emoji) {
            this.greetingEmoji = emoji;
            this.bot.on("message", this.onGreeting.bind(this));
            console.log("Bot has succesfully loaded greetings.");
        } else {
            console.error(`Unable to find the greeting emoji '${this.sharedSettings.autoReact.emoji}'.`);
        }
    }

    public onCommand(message: Discord.Message, command: string, args: string[]) {
        const authorId = message.author.id;

        if (command === "refresh_thinking") {
            message.reply("reloading thinking emojis.");
            this.refreshThinkingEmojis();
            return;
        }

        if (command === "toggle_react") {
            this.onToggleReactRequest(message, authorId);
            return;
        }

        if (command === "toggle_default_thinking") {
            this.onToggleThinkingRequest(message, authorId);
            return;
        }

        if (this.ignoreUsers.indexOf(authorId) !== -1)  return;  // Only react to people not on list

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
        if (this.thinkingUsers.indexOf(authorId) !== -1) {
            message.react("🤔");
            return;
        }

        // Otherwise use our custom ones
        const emoji = message.guild.emojis.filter((x: Discord.Emoji) => x.name.includes("thinking")).random();
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

        if (message.author.bot) return;
        const greeting = message.content.toLowerCase();

        const words = [
            "hello", "hi", "hey",
            "good morning", "goodmorning",
            "good evening", "goodevening",
            "good night", "goodnight",
            "good day", "goodday",
        ];

        const endChars = [
            " ", "!", ",", ".",
        ];

        // Determine if the greeting is just the greeting, or ends in punctuation and not "his"
        const shouldReact = words.some(x => {
            if (greeting === x) { return true; }

            const endChar = greeting.slice(-1);
            return greeting.startsWith(x) && endChars.findIndex(y => y === endChar) !== -1;
        });

        if (!shouldReact) {
            return;
        }

        if (this.ignoreUsers.indexOf(message.author.id) !== -1) {
            return;
        }

        message.react(this.greetingEmoji);
    }

    private refreshThinkingEmojis() {
        const guilds = this.bot.guilds.array();
        for (const guild of guilds) {
            const emojiSet = guild.emojis.filter((x: Discord.Emoji) => x.name.includes("thinking"));
            this.thinkingEmojis = this.thinkingEmojis.concat(emojiSet.array());
        }
    }
}
