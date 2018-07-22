import fetch from "node-fetch";
import Discord = require("discord.js");
import { SharedSettings } from "./SharedSettings";
import * as CheerioAPI from "cheerio";
import * as momentjs from "moment";
import Botty from "./Botty";

interface ESportsAPIReturnData {
    resultsHtml: string;
    fixturesHtml: string;
    resultsMonths: string;
    fixturesMonths: string;
}

interface ESportsLeagueSchedule {
    league: string;
    time: string;
    teamA: string;
    teamB: string;
}

export default class ESportsAPI {
    private bot: Discord.Client;
    private settings: SharedSettings;

    // Map<String, Map<String, ESportsLeagueSchedule>>
    private schedule: { [date: string]: { [league: string]: ESportsLeagueSchedule[] } } = {};

    constructor(bot: Discord.Client, settings: SharedSettings) {
        this.bot = bot;
        this.settings = settings;

        bot.on("ready", async () => {
            await this.loadData();
            this.postInfo();
        });
    }

    public onCheckNext(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (args.length !== 1) return;

        // day / month
        const formatCheck = new RegExp("\\d\\d/\\d\\d");
        if (!formatCheck.test(args[0])) return;

        const data = args[0].split("/");
        const date = `${data[0]} ${data[1]} ${new Date().getFullYear()}`;

        this.sendPrintout(message.channel as Discord.TextChannel, this.schedule[date], date);
    }

    private postInfo() {
        const esports = this.bot.guilds.get(this.settings.server)!.channels.find("name", "esports-spoilers");
        if (!esports) {
            console.error(`OfficeHours: Unable to find channel #esports-spoilers`);
            return;
        }

        const now = new Date();
        const date = `${now.getDate()} ${("0" + (now.getMonth() + 1)).slice(-2)} ${now.getFullYear()}`;

        // filter old games
        const prints: { [league: string]: ESportsLeagueSchedule[] } = {};
        Object.keys(this.schedule[date]).forEach(league => {
            prints[league] = this.schedule[date][league].filter(e => e.time.indexOf("ago") === -1);
        });

        this.sendPrintout(esports as Discord.TextChannel, prints, date);
        setTimeout(this.postInfo, 3600000);
    }

    private sendPrintout(channel: Discord.TextChannel, data: { [league: string]: ESportsLeagueSchedule[] }, date: string) {
        let output = `Games being played ${date.split(" ").join("/")}:\n\`\`\``;
        const padLeague = Object.keys(data).reduce((a, b) => a.length > b.length ? a : b).length;
        Object.keys(data).forEach(league => {
            const games = data[league];
            for (const game of games) {
                output += `[${league.padEnd(padLeague)}] ${game.teamA.padEnd(3)} vs ${game.teamB.padEnd(3)} -- ${game.time}\n`;
            }
        });
        output += "```";

        channel.send(output);
    }

    // this can also check for older games by using resultsHtml instead of fixures
    private async loadData() {
        // pull data
        const data = await fetch("https://eu.lolesports.com/en/api/widget/schedule?timezone=Europe%2FOslo&leagues=26&leagues=3&leagues=2&leagues=6&leagues=7&leagues=5&leagues=4&leagues=9&leagues=10&leagues=1&leagues=43&slug=all");
        const html = (await data.json() as ESportsAPIReturnData).fixturesHtml;
        const schedule: { [date: string]: { [league: string]: ESportsLeagueSchedule[] } } = {};

        // for each date
        const asHtml = CheerioAPI.load(html);
        const parents = asHtml.root().find(".schedule__row-group");
        parents.each((indexed, elem) => {
            // the current date
            const elemRoot = CheerioAPI.load(elem).root();
            const date = elemRoot.find(".schedule__row--date").find("h2").text().split(" ");

            // hack to get month number from text
            const month = ("0" + ("JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(date[2].substr(0, 3)) / 3 + 1)).slice(-2);

            const realDate = `${date[1]} ${month} ${new Date().getFullYear()}`;
            schedule[realDate] = {};

            // for each league
            const titles = elemRoot.find(".schedule__row--title");
            for (let index = 0; index < titles.length; index++) {
                const titleRow = titles.get(index);
                const tableRow = titleRow.next;

                // league title
                const titleRoot = CheerioAPI.load(titleRow).root();
                const title = titleRoot.find("h3 a").text();
                schedule[realDate][title] = Array();

                // league games
                const tableRoot = CheerioAPI.load(tableRow).root();
                const games = tableRoot.find(".schedule__table-row");

                // for each game
                for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
                    const gameRow = games.get(gameIndex);
                    const gameRoot = CheerioAPI.load(gameRow).root();

                    // game start time
                    const start = gameRoot.find(".schedule__table-cell--time .time").last().text().trim();

                    // RFC2822 timestamp to avoid error in momentjs
                    const timestamp = realDate + ` ${start}`;
                    const difference = momentjs(timestamp, "DD MM YYYY HH:mm Z").fromNow();

                    // teams
                    const content = gameRoot.find(".schedule__table-cell--content .team a");
                    const teamA = content.first().text();
                    const teamB = content.last().text();

                    const gameData: ESportsLeagueSchedule = {
                        league: title,
                        time: difference,
                        teamA,
                        teamB,
                    };
                    schedule[realDate][title].push(gameData);
                }
            }
        });
        this.schedule = schedule;
        setTimeout(this.loadData, 3600000);
    }
}
