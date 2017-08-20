import Discord = require("discord.js");
import { fileBackedObject } from "./util";

export default class Thinking {
    private bot: Discord.Client;
    private thinkingUsers: string[];

    constructor(bot: Discord.Client, userFile: string) {
        console.log("Requested Thinking extension..");
        this.bot = bot;

        this.thinkingUsers = fileBackedObject(userFile);
        console.log("Successfully loaded original thinking user file.");

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onMessage.bind(this));
    }

    onBot() {
        console.log("Thinking extension loaded.");
    }

    onMessage(message: Discord.Message) {
        if (message.content.startsWith("!original_thinko_reacts_only") && this.thinkingUsers.indexOf(message.author.id) === -1) {
            this.thinkingUsers.push(message.author.id);

            message.reply("I will now discriminate for you. !no_more_original_thinkos to stop.");
            return;
        } else if (message.content.startsWith("!no_more_original_thinkos") && this.thinkingUsers.indexOf(message.author.id) !== -1) {
            const index = this.thinkingUsers.indexOf(message.author.id);
            this.thinkingUsers.splice(index, 1);

            message.reply("REEEEEEEEEEEEEEEEE");
            return;
        }

        if (!message.content.includes("🤔")) return;

        if (this.thinkingUsers.indexOf(message.author.id) === -1) {
            const emoji = message.guild.emojis.filter(x => x.name.includes("thinking")).random();
            if (emoji) {
                message.react(emoji.identifier);
                return;
            }
        }

        message.react("🤔");
    }
}
