import Discord = require("discord.js");

export default class CategorisedMessage {

    private categoryList: { [emoji: string]: Discord.EmbedBuilder };
    private currentPage: Discord.EmbedBuilder;

    constructor(messages: { [emoji: string]: Discord.EmbedBuilder }) {
        this.categoryList = messages;

        for (const page in messages) {
            this.currentPage = messages[page];
            break;
        }
    }

    public setPage(emoji: Discord.Emoji): Discord.EmbedBuilder {
        this.currentPage = this.categoryList[emoji.identifier];

        return this.currentPage;
    }
}
