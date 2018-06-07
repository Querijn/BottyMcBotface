import Discord = require("discord.js");

export default class CategorisedMessage {

    private categoryList: { [emoji: string]: Discord.RichEmbed };
    private currentPage: Discord.RichEmbed;

    constructor(messages: { [emoji: string]: Discord.RichEmbed }) {
        this.categoryList = messages;

        for (const page in messages) {
            this.currentPage = messages[page];
            break;
        }
    }

    public setPage(emoji: Discord.Emoji): Discord.RichEmbed {
        this.currentPage = this.categoryList[emoji.identifier];

        return this.currentPage;
    }
}
