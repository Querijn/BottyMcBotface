import fetch from "node-fetch";
import Discord = require("discord.js");
import { SharedSettings } from "./SharedSettings";
import { clearTimeout, setTimeout } from "timers";
import * as CheerioAPI from "cheerio";
import * as momentjs from "moment";

interface ESportsAPIReturnData {
    resultsHtml: string;
    fixturesHtml: string;
    resultsMonths: string;
    fixturesMonths: string;
}

interface ESportsLeagueSchedule {
    league: string;
    url: string | undefined;
    time: string;
    teamA: string;
    teamB: string;
}

export default class ESportsAPI {
    private bot: Discord.Client;
    private settings: SharedSettings;
    private esportsChannel: Discord.GuildChannel | null = null;

    private schedule: Map<string, Map<string, ESportsLeagueSchedule[]>> = new Map();
    private postInfoTimeOut: NodeJS.Timer | null;
    private loadDataTimeOut: NodeJS.Timer | null;

    constructor(bot: Discord.Client, settings: SharedSettings) {
        this.bot = bot;
        this.settings = settings;

        bot.on("ready", async () => {

            const channel = this.settings.esports.printChannel;
            const guild = this.bot.guilds.get(this.settings.server.guildId);
            this.esportsChannel = guild!.channels.find("name", channel);
            if (this.esportsChannel == null) {
                if (this.settings.botty.isProduction) {
                    console.error("Esports API ran into an error: We don't have an esports channel but we're on production!");
                }
                else {
                    this.esportsChannel = await guild!.createChannel(channel, "text");
                }
            }

            await this.loadData();
            this.postInfo(true);
        });
    }

    public async onCheckNext(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        if (message.guild && this.esportsChannel && message.channel.id !== this.esportsChannel.id) {
            message.channel.send(`To avoid spoilers, this command is restricted to ${this.esportsChannel.name}.`);
            return;
        }

        if (args.length === 0) args = ["today"];
        if (args.length !== 1) return;

        const data = args[0].trim().split(/[\/ -]/g);
        let date;

        const fullCheck = /\d{4}\/\d{1,2}\/\d{1,2}/;
        const curYearCheck = /\d{1,2}\/\d{1,2}/;

        // YYYY/MM/DD
        if (fullCheck.test(args[0])) {
            date = `${data[0]} ${parseInt(data[1], 10)} ${parseInt(data[2], 10)}`;
        }

        // MM/DD
        else if (curYearCheck.test(args[0])) {
            const currentYear = new Date().getFullYear();
            date = `${currentYear} ${parseInt(data[0], 10)} ${parseInt(data[1], 10)}`;
        }

        else if (args[0].toLowerCase() === "today") {
            const today = new Date();
            date = `${today.getFullYear()} ${today.getMonth() + 1} ${today.getDate()}`;
        }

        else if (args[0].toLowerCase() === "tomorrow") {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            date = `${tomorrow.getFullYear()} ${tomorrow.getMonth() + 1} ${tomorrow.getDate()}`;
        }

        // No match
        else {
            message.channel.send("The date you specified didn't match the format needed. (MM/DD or YYYY/MM/DD)");
            return;
        }

        const jsDate = new Date(date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (jsDate < now) {
            message.channel.send("The date has to be in the future.");
            return;
        }

        const schedule = this.schedule.get(date);
        this.sendPrintout(message.channel as Discord.TextChannel, schedule, date, false);
    }

    private postInfo(isUpdateMessage: boolean = false) {
        if (!this.esportsChannel) {
            console.error(`Esports: Unable to find channel #${this.esportsChannel}`);
            return;
        }

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0);
        tomorrow.setMinutes(0);

        let tellDate = "";

        // filter to only show new games (up-to one day in advance)
        const prints: Map<string, ESportsLeagueSchedule[]> = new Map();
        for (const [dateKey, entries] of this.schedule.entries()) {
            if (new Date(dateKey) > tomorrow) break;

            tellDate = dateKey;
            for (const [league, entryList] of entries) {
                for (const item of entryList) {

                    const time = momentjs(item.time, "YYYY MM DD HH:mm");
                    if (time.isBefore(new Date())) continue;

                    if (!prints.get(league)) {
                        prints.set(league, []);
                    }

                    prints.get(league)!.push(item);
                }
            }
        }

        this.sendPrintout(this.esportsChannel as Discord.TextChannel, prints, tellDate, isUpdateMessage);

        if (this.postInfoTimeOut) {
            clearTimeout(this.postInfoTimeOut);
            this.postInfoTimeOut = null;
        }
        this.postInfoTimeOut = setTimeout(this.postInfo.bind(this, true), this.settings.esports.printToChannelTimeout);
    }

    private sendPrintout(channel: Discord.TextChannel, data: Map<string, ESportsLeagueSchedule[]> | undefined, date: string, isUpdateMessage: boolean) {

        date = (date.replace(/ /g, "/") || momentjs().format("YYYY/M/D"));
        if (!data || data.size === 0) {
            if (!isUpdateMessage) channel.send(`No games played on ${date}`);
            return;
        }
        const embed = new Discord.RichEmbed();
        embed.title = `Games being played ${date}:`;
        if (!embed.fields) embed.fields = [];
        embed.color = 0x9b311a;

        for (const [league, games] of data) {

            let output = "";
            for (const game of games) {

                const moment = momentjs(game.time, "YYYY MM DD HH:mm");
                if (moment.isBefore(new Date())) continue;

                output += `${game.teamA} vs ${game.teamB}, ${moment.fromNow()}\n`;
            }

            if (output.trim().length === 0)
                continue;

            embed.fields.push({
                name: league,
                value: output + `[More about ${league} here](${this.getUrlByLeague(games[0])})\n`,
            });
        }

        channel.send({ embed });
    }

    // this can also check for older games by using resultsHtml instead of fixures
    private async loadData() {
        // pull data
        const data = await fetch("https://eu.lolesports.com/en/api/widget/schedule?timezone=UTC&slug=all");
        const html = (await data.json() as ESportsAPIReturnData).fixturesHtml;
        const schedule: Map<string, Map<string, ESportsLeagueSchedule[]>> = new Map();

        // for each date
        const asHtml = CheerioAPI.load(html);
        const parents = asHtml.root().find(".schedule__row-group");
        let currentYear = new Date().getFullYear();
        let currentMonth = new Date().getMonth() + 1;
        parents.each((_, dayGroup) => {
            // the current date
            const dayRoot = CheerioAPI.load(dayGroup).root();
            const date = dayRoot.find(".schedule__row--date").find("h2").text().split(" ");

            // get month number from text
            const gameMonth = new Date(`${date[1]} ${date[2]}`).getMonth() + 1;
            if (gameMonth < currentMonth) {
                currentMonth = gameMonth;
                currentYear++;
            }

            const realDate = `${currentYear} ${gameMonth} ${date[1]}`;
            schedule.set(realDate, new Map());

            // for each league
            const titles = dayRoot.find(".schedule__row--title");
            for (let index = 0; index < titles.length; index++) {
                const titleRow = titles.get(index);
                const tableRow = titleRow.next;

                // league title
                const titleRoot = CheerioAPI.load(titleRow).root();
                const title = titleRoot.find("h3 a").text();
                const url = titleRoot.find("h3 a").attr("href");
                schedule.get(realDate)!.set(title, []);

                // league games
                const tableRoot = CheerioAPI.load(tableRow).root();
                const games = tableRoot.find(".schedule__table-row");

                // for each game
                for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
                    const gameRow = games.get(gameIndex);
                    const gameRoot = CheerioAPI.load(gameRow).root();

                    // game start time
                    const start = gameRoot.find(".schedule__table-cell--time .time").last().text().trim();
                    const timestamp = realDate + ` ${start}`;

                    // teams
                    const content = gameRoot.find(".schedule__table-cell--content .team");
                    const teamA = content.first().text();
                    const teamB = content.last().text();

                    const gameData: ESportsLeagueSchedule = {
                        league: title,
                        url,
                        time: timestamp,
                        teamA,
                        teamB,
                    };
                    schedule.get(realDate)!.get(title)!.push(gameData);
                }
            }
        });
        this.schedule = schedule;

        if (this.loadDataTimeOut) {
            clearTimeout(this.loadDataTimeOut);
            this.loadDataTimeOut = null;
        }
        this.loadDataTimeOut = setTimeout(this.loadData.bind(this), this.settings.esports.updateTimeout);
    }

    private getUrlByLeague(leagueName: ESportsLeagueSchedule) {

        return "https://eu.lolesports.com" + leagueName.url;
    }
}
