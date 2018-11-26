import { fileBackedObject } from "../FileBackedObject";
import { setTimeout, clearTimeout } from "timers";

import Discord = require("discord.js");

interface TicTacToeScore {
    lowWins: number;
    highWins: number;
    draws: number;
}

enum TicTacToeBrain {
    RANDOM,
    MINIMAX, // should finish this sometime :shrug:
}

enum TicTacToeType {
    X = "X", O = "O",
}

namespace TicTacToeType {
    export function opposite(current: TicTacToeType): TicTacToeType | undefined {
        if (current === TicTacToeType.X) return TicTacToeType.O;
        if (current === TicTacToeType.O) return TicTacToeType.X;
        return undefined;
    }
}

interface TicTacToeGame {
    board: { [key: number]: TicTacToeType | undefined };
    turnPlayer: TicTacToeType;
    Xplayer: { name: string, id: string };
    Oplayer: { name: string, id: string };
    scoreKey: string;
    botBrain: TicTacToeBrain;
    channel: Discord.TextChannel;
    deleteTimeout: NodeJS.Timer;
    wantDraw: string[];
    wantRematch: string[];
    isActive: boolean;
}

export default class TicTacToe {

    private scores: { [key: string]: TicTacToeScore };
    private games: TicTacToeGame[] = [];

    constructor(client: Discord.Client, scorefile: string) {
        this.scores = fileBackedObject(scorefile);
        client.on("message", this.handleChat.bind(this));
        client.on("ready", () => {

            // delete all ttt channels on boot, because we lost all gamestate on restart
            const gameCategory = (client.channels.findAll("type", "category") as Discord.CategoryChannel[]).find(c => c.name === "games");
            (client.channels.findAll("type", "text") as Discord.TextChannel[])
                .filter(c => c.parent === gameCategory)
                .forEach(c => {
                    if (c.name.startsWith("ttt-")) {
                        c.delete();
                    }
                });
        });
    }

    public async onInvite(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        const opponent = message.mentions.users.first();
        if (!opponent) {
            message.reply("You need to specify an opponent to start a TTT game!");
            return;
        }

        if (opponent === message.author) {
            message.reply("You can't play against yourself!");
            return;
        }

        let opponentName: string;
        const senderName = message.author.username.toLowerCase();
        if (opponent.bot) {
            opponentName = "botty_player";
        } else {
            opponentName = opponent.username.toLowerCase();
        }

        const isAuthorHigherId = message.author.id.localeCompare(opponent.id) >= 0;
        const highP = isAuthorHigherId ? { name: senderName, id: message.author.id } : { name: opponentName, id: opponent.id };
        const lowP = isAuthorHigherId ? { name: opponentName, id: opponent.id } : { name: senderName, id: message.author.id };

        args = args.filter(a => a !== "");
        if (args.length >= 2) {
            if (args[1] === "score") {
                const key = highP.id + "_" + lowP.id;
                const highScore = this.scores[key].highWins;
                const lowScore = this.scores[key].lowWins;
                const drawScore = this.scores[key].draws;
                message.channel.send("Scores are: " + highP.name + " (" + highScore + ") - " + drawScore + " - " + "(" + lowScore + ") " + lowP.name);
                return;
            }

            message.channel.send("Invalid arguments for command, try \"score\"");
            return;
        }

        // limit users to starting one game themselfs
        const existingGames = message.guild.channels.filter(c => c.name.startsWith("ttt-"))
            .map(c => c.name
                .split("-")
                .splice(1, 3)
                .join("-")
                .split("-vs-"));

        let alreadyPlaying = false;
        existingGames.forEach(g => {
            if (g.includes(senderName) && g.includes(opponentName)) {
                alreadyPlaying = true;
            }
        });

        if (alreadyPlaying) {
            message.reply("You need to finish the game you are playing first!");
            return;
        }

        // only allow the players to send messages
        const permissions = [
            { id: message.author, type: "member", allow: ["SEND_MESSAGES"] },
            { id: opponent, type: "member", allow: ["SEND_MESSAGES"] },
            { id: message.guild.roles.find(r => r.name === "@everyone").id, type: "role", deny: ["SEND_MESSAGES"] },
        ];

        // setup a separate channel for the game, so we dont spam a real channel..
        const channelName = ("TTT-" + highP.name + "-vs-" + lowP.name).toLowerCase();
        const gameChannel = await message.guild.createChannel(channelName, "text", permissions) as Discord.TextChannel;
        let gameCategory = message.guild.channels.filter(c => c.type === "category").find(c => c.name === "games");
        if (!gameCategory) {
            gameCategory = await message.guild.createChannel("games", "category");
        }
        gameChannel.setParent(gameCategory);

        this.initFreshGame(gameChannel, highP, lowP);
    }

    private initFreshGame(gameChannel: Discord.TextChannel, player1: { name: string, id: string }, player2: { name: string, id: string }) {
        const game = {} as TicTacToeGame;
        this.games.push(game);

        const key = player1 + "_" + player2;
        const random = Math.floor(Math.random() * 2);
        game.Xplayer = random ? player1 : player2;
        game.Oplayer = random ? player2 : player1;
        game.channel = gameChannel;
        game.turnPlayer = TicTacToeType.O;
        game.botBrain = TicTacToeBrain.RANDOM;
        game.scoreKey = key;
        game.wantDraw = [];
        game.wantRematch = [];
        game.isActive = true;
        game.board = {
            1: undefined, 2: undefined, 3: undefined,
            4: undefined, 5: undefined, 6: undefined,
            7: undefined, 8: undefined, 9: undefined,
        };

        // print the "welcome" message
        const status = this.scores[key] || (this.scores[key] = { highWins: 0, lowWins: 0, draws: 0 });
        const gamesPlayed = status.highWins + status.lowWins + status.draws;
        const startingPlayer = random ? player1.name : player2.name;
        gameChannel.send(`Game ${gamesPlayed + 1} of ${player1.name} vs ${player2.name}\nThe gods have decided that ${startingPlayer} goes first`);

        this.incrementGameState(game, undefined);
    }

    private printGameBoard(game: TicTacToeGame) {
        const bl = game.board[1] || "1";
        const bm = game.board[2] || "2";
        const br = game.board[3] || "3";

        const ml = game.board[4] || "4";
        const mm = game.board[5] || "5";
        const mr = game.board[6] || "6";

        const tl = game.board[7] || "7";
        const tm = game.board[8] || "8";
        const tr = game.board[9] || "9";

        game.channel.send(`\`\`\`${tl} | ${tm} | ${tr}\n---------\n${ml} | ${mm} | ${mr}\n---------\n${bl} | ${bm} | ${br}\`\`\``);
    }

    private handleChat(message: Discord.Message) {
        const game = this.games.find(g => g.channel.id === message.channel.id);
        if (!game) return;

        if (game.isActive) {
            if (message.cleanContent === "!draw") {
                this.handleDraw(game, message.author.id);
            }

            if (message.cleanContent === "!ff") {
                this.handleFF(game, message.author.id);
            }
        }

        if (message.cleanContent === "!rematch") {
            this.handleRematch(game, message.author.id);
        }

        // ignore messages from the other player
        if (game.turnPlayer === TicTacToeType.X) {
            if (message.author.id === game.Oplayer.id) {
                return;
            }
        }
        if (game.turnPlayer === TicTacToeType.O) {
            if (message.author.id === game.Xplayer.id) {
                return;
            }
        }

        const regex = /^\d$/;
        if (regex.test(message.cleanContent)) {
            const move = +message.cleanContent;
            if (this.isValidMove(game.board, move)) {
                this.incrementGameState(game, move);
            }
        }
    }

    private handleRematch(game: TicTacToeGame, sender: string) {
        if (sender === game.Xplayer.id) {
            if (game.wantRematch.includes(game.Xplayer.id)) {
                return;
            }

            game.channel.send("Game will rematch when both players have entered the command");
            game.wantRematch.push(game.Xplayer.id);
        }

        if (sender === game.Oplayer.id) {
            if (game.wantRematch.includes(game.Oplayer.id)) {
                return;
            }

            game.channel.send("Game will rematch when both players have entered the command");
            game.wantRematch.push(game.Oplayer.id);
        }

        if (game.wantRematch.length === 2) {
            clearTimeout(game.deleteTimeout);
            this.games = this.games.filter(g => g !== game);
            this.initFreshGame(game.channel, game.Xplayer, game.Oplayer);
        }
    }

    private handleFF(game: TicTacToeGame, sender: string) {
        if (sender === game.Xplayer.id) {
            this.handleEndOfGame(game, game.Oplayer.id);
        }

        if (sender === game.Oplayer.id) {
            this.handleEndOfGame(game, game.Xplayer.id);
        }
    }

    private handleDraw(game: TicTacToeGame, sender: string) {
        if (sender === game.Xplayer.id) {
            if (game.wantDraw.includes(game.Xplayer.id)) {
                return;
            }

            game.channel.send("Game will draw when both players have entered the command");
            game.wantDraw.push(game.Xplayer.id);
        }

        if (sender === game.Oplayer.id) {
            if (game.wantDraw.includes(game.Oplayer.id)) {
                return;
            }

            game.channel.send("Game will draw when both players have entered the command");
            game.wantDraw.push(game.Oplayer.id);
        }

        if (game.wantDraw.length === 2) {
            this.handleEndOfGame(game, "-1");
        }
    }

    private isValidMove(board: { [key: number]: TicTacToeType | undefined }, move: number) {
        return board[move] === undefined && move > 0 && move < 10;
    }

    private incrementGameState(game: TicTacToeGame, move: number | undefined) {
        if (move) {
            game.board[move] = game.turnPlayer;
        }

        game.turnPlayer = TicTacToeType.opposite(game.turnPlayer)!;
        this.printGameBoard(game);

        const winner = this.getGameWinner(game);
        if (winner) {
            this.handleEndOfGame(game, winner);
            return;
        }

        this.doBottyMove(game);
    }

    private handleEndOfGame(game: TicTacToeGame, winner: string) {
        const high = game.Oplayer.id.localeCompare(game.Xplayer.id) >= 0;
        if (winner === game.Oplayer.id) {
            if (high) {
                this.scores[game.scoreKey].highWins++;
            } else {
                this.scores[game.scoreKey].lowWins++;
            }
        } else if (winner === game.Xplayer.id) {
            if (high) {
                this.scores[game.scoreKey].lowWins++;
            } else {
                this.scores[game.scoreKey].highWins++;
            }
        } else if (winner === "-1") {
            this.scores[game.scoreKey].draws++;
        }

        const oplayer = game.channel.members.find(m => m.id === game.Oplayer.id);
        const xplayer = game.channel.members.find(m => m.id === game.Xplayer.id);

        const highP = high ? oplayer.user.username : xplayer.user.username;
        const lowP = high ? xplayer.user.username : oplayer.user.username;
        const highScore = this.scores[game.scoreKey].highWins;
        const lowScore = this.scores[game.scoreKey].lowWins;
        const drawScore = this.scores[game.scoreKey].draws;

        game.isActive = false;
        game.channel.send("The game has ended!\nThis channel will be deleted in 30 seconds.\nScores are now: " + highP + " (" + highScore + ") - " + drawScore + " - " + "(" + lowScore + ") " + lowP);
        game.deleteTimeout = setTimeout(() => {
            this.games = this.games.filter(g => g !== game);
            game.channel.delete();
        }, 30 * 1000);
    }

    /**
     * returns "-1" for a draw
     * returns undefined for unfinished
     * otherwise the playerid of the winner
     */
    private getGameWinner(game: TicTacToeGame) {

        if (this.testPlayerWin(game, TicTacToeType.X)) {
            return game.Xplayer.id;
        }

        if (this.testPlayerWin(game, TicTacToeType.O)) {
            return game.Oplayer.id;
        }

        for (let i = 1; i < 10; i++) {
            if (game.board[i] === undefined) {
                return undefined;
            }
        }

        return "-1";
    }

    private testPlayerWin(game: TicTacToeGame, player: TicTacToeType) {
        return (game.board[1] === player && game.board[2] === player && game.board[3] === player) ||
            (game.board[4] === player && game.board[5] === player && game.board[6] === player) ||
            (game.board[7] === player && game.board[8] === player && game.board[9] === player) ||
            (game.board[1] === player && game.board[4] === player && game.board[7] === player) ||
            (game.board[2] === player && game.board[5] === player && game.board[8] === player) ||
            (game.board[3] === player && game.board[6] === player && game.board[9] === player) ||
            (game.board[1] === player && game.board[5] === player && game.board[9] === player) ||
            (game.board[3] === player && game.board[5] === player && game.board[7] === player);
    }

    private doBottyMove(game: TicTacToeGame) {
        const turnId = game.turnPlayer === TicTacToeType.X ? game.Xplayer : game.Oplayer;
        const isBottyTurn = game.channel.members.find(m => m.id === turnId.id).user.bot;

        if (isBottyTurn) {
            const bestMove = this.chooseMoveFromBrain(game.botBrain, game.board, game.turnPlayer);
            this.incrementGameState(game, bestMove);
        }
    }

    private chooseMoveFromBrain(brain: TicTacToeBrain, board: { [key: number]: TicTacToeType | undefined }, turn: TicTacToeType): number {
        switch (brain) {
            case TicTacToeBrain.RANDOM: {
                const validKeys = Object.entries(board).filter(e => e[1] === undefined).map(e => e[0]);
                return +validKeys[Math.floor(Math.random() * validKeys.length)];
            }
            default: {
                return this.chooseMoveFromBrain(TicTacToeBrain.RANDOM, board, turn);
            }
        }
    }
}
