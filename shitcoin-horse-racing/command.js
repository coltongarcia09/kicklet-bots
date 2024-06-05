<template>
{{/* Author: @EddieOz */}}

{{define "betSyntaxError"}}Invalid syntax. Use: !bet (blokitos) (Option: white, blue, green, brown){{end}}
{{define "notEnoughPoints"}}You do not have enough blokitos!{{end}}
{{define "betOpenMsg"}}The betting poll is now open! Place your bets on: white, blue, green, or brown.{{end}}
{{define "betCloseMsg"}}The betting poll is now closed! No more bets are accepted.{{end}}
{{define "betWinnerSetMsg"}}The winning option is {{kicklet.GetTempGlobalVar "winningOption"}}. Distributing {{kicklet.GetTempGlobalVar "totalBetPoints"}} blokitos to winners...{{end}}
{{define "betAcceptedMsg"}}{{ sender }} your bet was accepted.{{end}}
{{define "betAlreadyPlacedMsg"}}You have already placed a bet. You can only place one bet per poll.{{end}}
{{define "noPermissionMsg"}}@{{ sender }} you have no permission to do this.{{end}}
{{ define "helpMsg" }}usage: aposta !bet [qtde] [white|blue|green|brown], !bet odds{{end}}
{{define "oddsMsg"}}Current odds: White: {{kicklet.GetCounter "oddsWhite"}} Blue: {{kicklet.GetCounter "oddsBlue"}} Green: {{kicklet.GetCounter "oddsGreen"}} Brown: {{kicklet.GetCounter "oddsBrown"}}{{end}}

{{script.Call "main"}}
{{$result := script.Var "result"}}

{{if eq $result "NOT_ENOUGH_POINTS"}}{{template "notEnoughPoints"}}
{{else if eq $result "SYNTAX_ERROR"}}{{template "betSyntaxError"}}
{{else if eq $result "BET_OPEN"}}{{template "betOpenMsg"}}
{{else if eq $result "BET_CLOSE"}}{{template "betCloseMsg"}}
{{else if eq $result "WINNER_SET"}}{{template "betWinnerSetMsg"}}
{{else if eq $result "BET_ACCEPTED"}}{{template "betAcceptedMsg"}}
{{else if eq $result "BET_ALREADY_PLACED"}}{{template "betAlreadyPlacedMsg"}}
{{else if eq $result "BETTING_CLOSED"}}{{template "betCloseMsg"}}
{{else if eq $result "SHOW_ODDS"}}{{template "oddsMsg"}}
{{else if eq $result "NO_PERMISSION"}}{{template "noPermissionMsg"}}
{{else if eq $result "HELP"}}{{template "helpMsg"}}{{end}}
</template>

<script>
const username = $event.getSender().username;
const args = $event.getCommandArgs();
const options = ['white', 'blue', 'green', 'brown'];
let result;

function isInt(value) { return !isNaN(value) && parseInt(Number(value)) == value && !isNaN(parseInt(value, 10)); }
function isAdmin() { return ($event.getSender().hasPermission('broadcaster') || $event.getSender().hasPermission('moderator')); }

async function main() {
    let bettingOpen = Kicklet.getTempGlobalVar('bettingOpen');
    let totalBetPoints = Kicklet.getTempGlobalVar('totalBetPoints') || 0;

    if (args.length == 1 && args[0] === 'open' && isAdmin()) {
        Kicklet.setTempGlobalVar('bettingOpen', true, 600);
        Kicklet.setTempGlobalVar('winningOption', '', 600);
        Kicklet.setTempGlobalVar('totalBetPoints', 0, 600);
        for (let i = 0; i < 4; i++) Kicklet.setTempGlobalVar(`betsShard${i}`, '', 600);
        ['oddsWhite', 'oddsBlue', 'oddsGreen', 'oddsBrown', 'totalBetPoints'].forEach(counter => Kicklet.setCounter(counter, 0));
        result = 'BET_OPEN';
    } else if (args.length == 1 && args[0] === 'help') result = 'HELP';
    else if (args.length == 1 && args[0] === 'close' && isAdmin()) {
        Kicklet.setTempGlobalVar('bettingOpen', false, 600);
        result = 'BET_CLOSE';
    } else if (args.length == 2 && args[0] === 'set' && !bettingOpen && isAdmin()) {
        const winningOption = args[1];
        if (options.includes(winningOption)) {
            Kicklet.setTempGlobalVar('winningOption', winningOption, 600);
            await distributePoints(winningOption, await getAllBets(), totalBetPoints);
            result = 'WINNER_SET';
        } else result = 'SYNTAX_ERROR';
    } else if (args.length == 2 && isInt(args[0]) && options.includes(args[1]) && bettingOpen) {
        const bets = await getAllBets();
        if (bets.find(bet => bet.split(':')[0] === username)) result = 'BET_ALREADY_PLACED';
        else {
            const points = parseInt(Number(args[0])), option = args[1];
            const userPoints = (await Kicklet.getPoints(username)).data.points;
            if (userPoints >= points) {
                await addBet(`${username}:${points}:${option}`);
                totalBetPoints += points;
                Kicklet.setTempGlobalVar('totalBetPoints', totalBetPoints, 600);
                Kicklet.setCounter('totalBetPoints', totalBetPoints);
                Kicklet.setPoints(username, userPoints - points);
                await calculateOdds(await getAllBets(), totalBetPoints);
                result = 'BET_ACCEPTED';
            } else result = 'NOT_ENOUGH_POINTS';
        }
    } else if (args.length == 1 && args[0] === 'odds') {
        result = 'SHOW_ODDS';
        await calculateOdds(await getAllBets(), totalBetPoints);
    } else result = 'SYNTAX_ERROR';
}

async function distributePoints(winningOption, bets, totalBetPoints) {
    const winningBets = bets.filter(bet => bet.split(':')[2] === winningOption);
    const totalWinningPoints = winningBets.reduce((acc, bet) => acc + parseInt(bet.split(':')[1], 10), 0);

    for (const bet of winningBets) {
        const [username, points] = bet.split(':');
        const userPoints = (await Kicklet.getPoints(username)).data.points;
        const winPoints = Math.floor((parseInt(points, 10) / totalWinningPoints) * totalBetPoints);

        await Kicklet.setPoints(username, userPoints + winPoints);
        bets = bets.filter(b => b !== bet);
        await storeBets(bets);
        Kicklet.setTempGlobalVar('totalBetPoints', totalBetPoints - points, 600);
    }
    await clearBets();
    Kicklet.setTempGlobalVar('totalBetPoints', 0, 600);
}

async function storeBets(bets) {
    for (let i = 0; i < 4; i++) {
        const shardBets = bets.slice(i * 25, (i + 1) * 25).join(';');
        if (shardBets.length > 0) Kicklet.setTempGlobalVar(`betsShard${i}`, shardBets, 600);
        else Kicklet.deleteTempGlobalVar(`betsShard${i}`);
    }
}

async function calculateOdds(bets, totalBetPoints) {
    const pointsOnOption = option => bets.filter(bet => bet.split(':')[2] === option).reduce((acc, bet) => acc + parseInt(bet.split(':')[1], 10), 0);
    const oddsWhite = (pointsOnOption('white') / totalBetPoints).toFixed(2);
    const oddsBlue = (pointsOnOption('blue') / totalBetPoints).toFixed(2);
    const oddsGreen = (pointsOnOption('green') / totalBetPoints).toFixed(2);
    const oddsBrown = (pointsOnOption('brown') / totalBetPoints).toFixed(2);

    Kicklet.setCounter('oddsWhite', oddsWhite * 100);
    Kicklet.setCounter('oddsBlue', oddsBlue * 100);
    Kicklet.setCounter('oddsGreen', oddsGreen * 100);
    Kicklet.setCounter('oddsBrown', oddsBrown * 100);
}

async function getAllBets() {
    let bets = [];
    for (let i = 0; i < 4; i++) {
        const shard = Kicklet.getTempGlobalVar(`betsShard${i}`) || "";
        if (shard) bets = bets.concat(shard.split(';').filter(Boolean));
    }
    return bets;
}

async function addBet(newBet) {
    for (let i = 0; i < 4; i++) {
        let shard = Kicklet.getTempGlobalVar(`betsShard${i}`) || "";
        const shardArray = shard.split(';').filter(Boolean

);
        if (shardArray.length < 25) {
            shardArray.push(newBet);
            Kicklet.setTempGlobalVar(`betsShard${i}`, shardArray.join(';'), 600);
            return;
        }
    }
    throw new Error("No space available to add new bet");
}

async function clearBets() {
    for (let i = 0; i < 4; i++) Kicklet.deleteTempGlobalVar(`betsShard${i}`);
    Kicklet.deleteTempGlobalVar('bettingOpen');
    Kicklet.deleteTempGlobalVar('totalBetPoints');
    ['oddsWhite', 'oddsBlue', 'oddsGreen', 'oddsBrown', 'totalBetPoints'].forEach(counter => Kicklet.setCounter(counter, 0));
}
</script>