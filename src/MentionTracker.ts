import Discord = require("discord.js");

export default class MentionTracker {
    private bot: Discord.Client;


    constructor(bot: Discord.Client) {
        console.log("Requested Mention Tracking extension..");
        this.bot = bot;

        this.bot.on("message", this.onMention.bind(this));
    }

    onMention(message: Discord.Message) {
        for (let member of message.mentions.members) {
            if (!member) continue;
            for (let role of member[1].roles) {
                if (role[1].name === "Rioters") {
                    message.reply("please do not ping the rioters!");
                    return;                  
                }
            }
        }
    }

}