import Discord = require("discord.js");
import { setTimeout } from "timers";


/**
 *  Sends a embed with the number of bans on the server
 */
export default class BanCount {
    private async banCount(message: Discord.Message) {
        
        const guild = message.guild;
        if (!guild) {
            return;
        }

        const bans = await guild.fetchBans();
        const banCount = bans.size;

        const embed = new Discord.MessageEmbed()
            .setTitle("Ban Count")
            .setDescription(`There are **${banCount}** bans on this server.`)
            .setThumbnail("https://cdn.discordapp.com/attachments/959912987987148870/1104817393169088522/airplane_departure.png")
            .setColor("#ff0000");

        message.channel.send(embed);
    }

    public onBanCount(message: Discord.Message) {
        this.banCount(message);
    }
}