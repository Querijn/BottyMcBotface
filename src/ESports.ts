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

    private schedule: Map<string, Map<string, ESportsLeagueSchedule[]>> = new Map();

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

        // YYYY/MM/DD
        const formatCheck = /\d{4}\/\d{2}\/\d{2}/;
        if (!formatCheck.test(args[0])) {
            message.channel.send("The date you specified didn't match the format needed. (YYYY/MM/DD)");
            return;
        }

        const data = args[0].split("/");
        const date = `${data[0]} ${data[1]} ${data[2]}`;

        this.sendPrintout(message.channel as Discord.TextChannel, this.schedule.get(date), date);
    }

    private postInfo() {
        const channel = this.settings.esports.printChannel;
        const esports = this.bot.guilds.get(this.settings.server)!.channels.find("name", channel);
        if (!esports) {
            console.error(`Esports: Unable to find channel #${channel}`);
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

                    if (!item.time.includes("ago")) {
                        if (!prints.get(league)) {
                            prints.set(league, []);
                        }

                        prints.get(league)!.push(item);
                    }
                }
            }
        }

        this.sendPrintout(esports as Discord.TextChannel, prints, tellDate);
        setTimeout(this.postInfo.bind(this), this.settings.esports.printToChannelTimeout);
    }

    private sendPrintout(channel: Discord.TextChannel, data: Map<string, ESportsLeagueSchedule[]> | undefined, date: string) {

        if (!data) {
            channel.send("No games played on this date.");
            return;
        }

        let output = `Games being played ${date.split(" ").join("/")}:\n\`\`\``;
        const padLeague = Math.max(...Array.from(data!.keys()).map((x: string) => x.length));
        for (const [league, games] of data!) {
            for (const game of games) {
                output += `[${league.padEnd(padLeague)}] ${game.teamA.padEnd(3)} vs ${game.teamB.padEnd(3)} -- ${game.time}\n`;
            }
        }
        output += "```";

        channel.send(output);
    }

    // this can also check for older games by using resultsHtml instead of fixures
    private async loadData() {
        // pull data
        const data = await fetch("https://eu.lolesports.com/en/api/widget/schedule?timezone=Europe%2FOslo&leagues=26&leagues=3&leagues=2&leagues=6&leagues=7&leagues=5&leagues=4&leagues=9&leagues=10&leagues=1&leagues=43&slug=all");
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
                    const difference = momentjs(timestamp, "YYYY MM DD HH:mm Z").fromNow();

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
                    schedule.get(realDate)!.get(title)!.push(gameData);
                }
            }
        });
        this.schedule = schedule;
        setTimeout(this.loadData, this.settings.esports.updateTimeout);
    }
}
