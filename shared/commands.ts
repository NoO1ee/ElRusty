export const teamCommands = [
  {
    name: 'timer',
    syntax: '!timer add <tid> <namn> / !timer cancel <ID>',
    description:
      'Skapa 10s–7d engångstimer eller avbryt din egen. Exempel: !timer add 15m Oil Rig.',
    group: 'timers',
  },
  {
    name: 'timers',
    syntax: '!timers [sida]',
    description: 'Lista aktiva timers, fem per sida. !timer utan argument visar samma lista.',
    group: 'timers',
  },
  {
    name: 'help',
    syntax: '!help [kommando/grupp]',
    description: 'Visa hjälp. Grupper: server, team, timers, styrning.',
    group: 'server',
  },
  {
    name: 'time',
    syntax: '!time',
    description:
      'Visa speltid och ungefärlig verklig tid till natt/dag. Uppskattning direkt; bättre precision efter inlärning. Fryst tid anges.',
    group: 'server',
  },
  {
    name: 'pop',
    syntax: '!pop',
    description: 'Visa spelarantal och kö när servern skickar köfältet.',
    group: 'server',
  },
  {
    name: 'wipe',
    syntax: '!wipe',
    description: 'Visa tid sedan serverns senaste rapporterade wipe.',
    group: 'server',
  },
  {
    name: 'uptime',
    syntax: '!uptime',
    description: 'Visa hur länge ElRusty och den aktuella Rust+-anslutningen varit igång.',
    group: 'server',
  },
  {
    name: 'events',
    syntax: '!events',
    description:
      'Visa eventmarkörer om servern skickar dem. Vanilla-Rust+ skickar inte längre eventdata.',
    group: 'server',
  },
  {
    name: 'where',
    syntax: '!where [namn/SteamID]',
    description: 'Visa din eller en teammedlems kartruta.',
    group: 'team',
  },
  {
    name: 'online',
    syntax: '!online',
    description: 'Lista teammedlemmar som är online.',
    group: 'team',
  },
  {
    name: 'offline',
    syntax: '!offline',
    description: 'Lista teammedlemmar som är offline.',
    group: 'team',
  },
  {
    name: 'alive',
    syntax: '!alive [namn/SteamID]',
    description: 'Visa överlevnadstid eller vem som levt längst, när spawn-tid finns.',
    group: 'team',
  },
  {
    name: 'steamid',
    syntax: '!steamid [namn]',
    description: 'Visa ditt eller en teammedlems SteamID64.',
    group: 'team',
  },
  {
    name: 'prox',
    syntax: '!prox',
    description: 'Visa avstånd på kartan till högst tre närmaste levande lagkamrater online.',
    group: 'team',
  },
  {
    name: 'death',
    syntax: '!death [namn/SteamID]',
    description: 'Visa senaste sparade dödsplats. Platser sparas för det parade kontot.',
    group: 'team',
  },
  {
    name: 'switch',
    syntax: '!switch <namn/ID> on/off',
    description: 'Styr en switch. Kräver styrbehörighet.',
    group: 'styrning',
  },
  {
    name: 'group',
    syntax: '!group <namn> on/off',
    description: 'Styr en switchgrupp. Kräver styrbehörighet.',
    group: 'styrning',
  },
  {
    name: 'mode',
    syntax: '!mode <namn/ID>',
    description: 'Aktivera ett sparat läge. Kräver styrbehörighet.',
    group: 'styrning',
  },
  {
    name: 'makeleader',
    syntax: '!makeleader',
    description: 'Begär ledarskap. Kräver styrbehörighet och att parade kontot är ledare.',
    group: 'styrning',
  },
] as const;
