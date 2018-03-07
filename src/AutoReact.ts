import { SharedSettings } from "./SharedSettings";
import { fileBackedObject } from "./FileBackedObject";

import Discord = require("discord.js");

export default class AutoReact {
    private bot: Discord.Client;
    private thinkingUsers: string[];
    private ignoreUsers: string[];
    private greetingEmoji: Discord.Emoji;
    private sharedSettings: SharedSettings;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, userFile: string, ignoreFile: string) {
        console.log("Requested Thinking extension..");
        this.bot = bot;

        this.sharedSettings = sharedSettings;

        this.thinkingUsers = fileBackedObject(userFile);
        console.log("Successfully loaded original thinking user file.");

        this.ignoreUsers = fileBackedObject(ignoreFile);
        console.log("Successfully loaded ignore reaction file.");

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onThinking.bind(this));
    }

    onBot() {
        console.log("Thinking extension loaded.");

        let emoji = this.bot.emojis.get(this.sharedSettings.autoReact.emoji);
        if (emoji instanceof Discord.Emoji) {
            this.greetingEmoji = emoji;
            this.bot.on("message", this.onGreeting.bind(this));
            console.log("Bot has succesfully loaded greetings.");
        }
        else {
            console.error(`Unable to find the greeting emoji '${this.sharedSettings.autoReact.emoji}'.`);
        }
    }

    onThinking(message: Discord.Message) {

        if (message.author.bot) return;
        const authorId = message.author.id;

        if (message.content.startsWith("!toggle_react")) {
            this.onToggleReactRequest(message, authorId);
            return;
        }

        if (this.ignoreUsers.indexOf(authorId) !== -1) return; // Only react to people not on list

        if (message.content.startsWith("!toggle_default_thinking")) {
            this.onToggleThinkingRequest(message, authorId);
            return;
        }

        if (!message.content.includes("🤔")) return;

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

    onToggleReactRequest(message: Discord.Message, authorId: string) {
        
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

    onToggleThinkingRequest(message: Discord.Message, authorId: string) {
        
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

    onGreeting(message: Discord.Message) {

        if (message.author.bot) return;
        let greeting = message.content.toLowerCase();
        
        const words = [
            "hello", "hi", "hey",
            "good morning", "goodmorning",
            "good evening", "goodevening",
            "good night", "goodnight",
            "good day", "goodday"
        ];

        const shouldReact = words.some(x => greeting.startsWith(x));

        if (!shouldReact) {
            return;
        }

        if (this.ignoreUsers.indexOf(message.author.id) !== -1) {
            return;
        }

        message.react(this.greetingEmoji);
    }
}
