import * as Discord from "discord.js";

export default class SpamKillerEmbeds {
    private static stopImageURL = "https://upload.wikimedia.org/wikipedia/commons/1/19/Stop2.png";
    private static warnImageURL = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Antu_dialog-warning.svg/240px-Antu_dialog-warning.svg.png";

    static noSupportEmbed() {
        return new Discord.EmbedBuilder()
            .setTitle("There is no game or account support here")
            .setColor(0xff0000)
            .setThumbnail(this.stopImageURL)
            .setDescription(`This Discord server is for the Riot Games API, a tool which provides data to sites like op.gg. ` + 
                `No one here will be able to help you with support or gameplay issues. If you're having account related issues ` + 
                `or technical problems, contact Player support. If you have game feedback, see the links below.`)
            .addFields([
                {name: "Player Support", value: " [Player Support](https://support.riotgames.com/hc/en-us)", inline: true},
                {name: "League", value: "[Discord](https://discord.gg/leagueoflegends)\n[Subreddit](https://reddit.com/leagueoflegends)", inline: true},
                {name: "\u200b", value: "\u200b", inline: true},
                {name: "Valorant", value: "[Discord](https://discord.gg/valorant)\n[Subreddit](https://reddit.com/valorant)", inline: true},
                {name: "LoR", value: "[Discord](https://discord.gg/LegendsOfRuneterra)\n[Subreddit](https://reddit.com/r/LegendsofRuneterra)", inline: true},
                {name: "\u200b", value: "\u200b", inline: true}
            ]);
    }
    static stopEmbed(title: string, description: string) {
        return new Discord.EmbedBuilder()
            .setTitle(title)
            .setColor(0xff0000)
            .setThumbnail(this.stopImageURL)
            .setDescription(description);
}
    static warnEmbed(title: string, description: string) {
        return new Discord.EmbedBuilder()
            .setTitle(title)
            .setColor(0xffcc00)
            .setThumbnail(this.warnImageURL)
            .setDescription(description);
    }
}