import { SharedSettings } from "./SharedSettings";
import { fileBackedObject } from "./FileBackedObject";

import Discord = require("discord.js");

export default class AutoReact {
    private bot: Discord.Client;
    private thinkingUsers: string[];
    private ignoreUsers: string[];
    private thinkingEmojis: Discord.Emoji[] = [];
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

        this.refreshThinkingEmojis();

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

    refreshThinkingEmojis() {
        const guilds = this.bot.guilds.array();
        for (let i = 0; i < guilds.length; i++) {
            const emojiSet = guilds[i].emojis.filter((x: Discord.Emoji) => x.name.includes("thinking"));
            this.thinkingEmojis = this.thinkingEmojis.concat(emojiSet.array());
        }
    }

    onThinking(message: Discord.Message) {

        if (message.author.bot) return;
        const authorId = message.author.id;

        if (message.content.startsWith("!refresh_thinking")) {
            message.reply("reloading thinking emojis.")
            this.refreshThinkingEmojis();
            return;
        }

        if (message.content.startsWith("!toggle_react")) {
            this.onToggleReactRequest(message, authorId);
            return;
        }

        if (this.ignoreUsers.indexOf(authorId) !== -1) return; // Only react to people not on list

        if (message.content.startsWith("!toggle_default_thinking")) {
            this.onToggleThinkingRequest(message, authorId);
            return;
        }

        if (!message.content.includes("🤔")) {

            // If it's not the regular thinking emoji, maybe it's one of our custom ones?
            let emojiIds = /<:(.*?):([0-9]+)>/g.exec(message.content);
            if (!emojiIds) return;

            let found = false;
            for (let i = 2; i < emojiIds.length; i += 3) {
                const emoji = emojiIds[i];
                if (!this.thinkingEmojis.some((e: Discord.Emoji) => e.id == emoji))
                    continue;
                
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
