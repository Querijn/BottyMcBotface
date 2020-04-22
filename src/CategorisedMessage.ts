import Discord = require("discord.js");

export default class CategorisedMessage {

    private categoryList: { [emoji: string]: Discord.MessageEmbed };
    private currentPage: Discord.MessageEmbed;

    constructor(messages: { [emoji: string]: Discord.MessageEmbed }) {
        this.categoryList = messages;

        for (const page in messages) {
            this.currentPage = messages[page];
            break;
        }
    }

    public setPage(emoji: Discord.Emoji): Discord.MessageEmbed {
        this.currentPage = this.categoryList[emoji.identifier];

        return this.currentPage;
    }
}
