import type { LexiconEntry, LexiconPack } from '../../types';
import { buildSeededSharedLexicon, splitWordPairs } from './shared';

const ITALIAN_EXPLICIT_ENTRIES: LexiconEntry[] = [
  {
    lexicalEntryId: 'phrase.hello',
    targetForm: 'ciao',
    alternates: ['salve'],
    gloss: 'hello',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.my_name_is',
    targetForm: 'mi chiamo',
    gloss: 'my name is',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.i_am',
    targetForm: 'sono',
    gloss: 'I am',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.good_morning',
    targetForm: 'buongiorno',
    gloss: 'good morning',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.thank_you',
    targetForm: 'grazie',
    alternates: ['grazie mille'],
    gloss: 'thank you',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.please',
    targetForm: 'per favore',
    gloss: 'please',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.suitcase',
    targetForm: 'valigia',
    alternates: ['valigie'],
    gloss: 'suitcase',
    category: 'object',
    introductionBand: 'B0',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'color.red',
    targetForm: 'rossa',
    alternates: ['rosso'],
    gloss: 'red',
    category: 'color',
    introductionBand: 'B0',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'affirmation.yes',
    targetForm: 'si',
    alternates: ['sì'],
    gloss: 'yes',
    category: 'function',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'color.blue',
    targetForm: 'blu',
    gloss: 'blue',
    category: 'color',
    introductionBand: 'B1',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'location.here',
    targetForm: 'qui',
    gloss: 'here',
    category: 'location',
    introductionBand: 'B1',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'location.there',
    targetForm: 'li',
    alternates: ['lì', 'la', 'là'],
    gloss: 'there',
    category: 'location',
    introductionBand: 'B1',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'verb.is_located',
    targetForm: 'si trova',
    alternates: ['è'],
    gloss: 'is / is located',
    category: 'verb',
    introductionBand: 'B1',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'color.black',
    targetForm: 'nera',
    alternates: ['nero'],
    gloss: 'black',
    category: 'color',
    introductionBand: 'B2',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'object.door',
    targetForm: 'porta',
    alternates: ['porte'],
    gloss: 'door',
    category: 'object',
    introductionBand: 'B2',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'verb.help',
    targetForm: 'aiutare',
    alternates: ['aiuto', 'aiutami'],
    gloss: 'help',
    category: 'verb',
    introductionBand: 'B2',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.where_is',
    targetForm: 'dove si trova',
    alternates: ["dov'è"],
    gloss: 'where is',
    category: 'phrase',
    introductionBand: 'B2',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'adjective.small',
    targetForm: 'piccola',
    alternates: ['piccolo'],
    gloss: 'small',
    category: 'adjective',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.counter',
    targetForm: 'banco',
    alternates: ['sportello'],
    gloss: 'counter',
    category: 'object',
    introductionBand: 'B3',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'location.beside',
    targetForm: 'accanto a',
    alternates: ['vicino a'],
    gloss: 'beside / next to',
    category: 'location',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.ribbon_green',
    targetForm: 'nastro verde',
    alternates: ['nastro'],
    gloss: 'green ribbon',
    category: 'object',
    introductionBand: 'B3',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'verb.look_for',
    targetForm: 'cercare',
    alternates: ['cerco', 'cercando'],
    gloss: 'look for',
    category: 'verb',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'verb.find',
    targetForm: 'trovare',
    alternates: ['trovo', 'trovato'],
    gloss: 'find',
    category: 'verb',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'location.platform',
    targetForm: 'binario',
    gloss: 'platform',
    category: 'location',
    introductionBand: 'B4',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'adjective.leather',
    targetForm: 'di cuoio',
    alternates: ['cuoio'],
    gloss: 'leather',
    category: 'adjective',
    introductionBand: 'B4',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'adjective.worn',
    targetForm: 'consumata',
    alternates: ['consumato', 'logora'],
    gloss: 'worn',
    category: 'adjective',
    introductionBand: 'B4',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.side_door',
    targetForm: 'porta laterale',
    alternates: ['ingresso laterale'],
    gloss: 'side door',
    category: 'object',
    introductionBand: 'B4',
    usage: 'active',
    groundable: true,
  },
];

// Format: english gloss = italian target form
const ITALIAN_COMMON_WORDS = splitWordPairs(`
of = di
the = il
the = la
the = i
the = le
the = gli
that = che
in = in
and = e
to = a
for = per
a = un
a = una
with = con
no = no
his/her = suo
his/her = sua
to the = al
it = lo
like = come
more = più
but = ma
their = loro
him = gli
already = già
or = o
this = questo
if = se
because = perché
this = questa
between = tra
when = quando
very = molto
without = senza
about = su
also = anche
me = me
until = fino a
there is = c'è
where = dove
who = chi
from = da
all = tutto
us = ci
during = durante
all = tutti
one = uno
them = li
neither = né
against = contro
others = altri
that = quello
that = quella
before = prima
they = loro
this = ciò
my = mio
my = mia
before = prima di
some = alcuni
some = alcune
some = qualche
I = io
another = altro
other = altre
other = altra
the same = lo stesso
so much = tanto
these = questi
these = queste
much = molto
who = chi
nothing = niente
nothing = nulla
many = molti
which = quale
little = poco
she = lei
to be = essere
to be = stare
person = persona
people = gente
man = uomo
woman = donna
child = bambino
girl = bambina
boy = ragazzo
family = famiglia
mother = madre
father = padre
mom = mamma
dad = papà
parents = genitori
brother = fratello
sister = sorella
son = figlio
daughter = figlia
grandmother = nonna
grandfather = nonno
uncle = zio
aunt = zia
cousin (m) = cugino
cousin (f) = cugina
friend (m) = amico
friend (f) = amica
neighbor (m) = vicino
neighbor (f) = vicina
teacher = maestro
professor = professore
professor (f) = professoressa
student = studente
doctor = dottore
doctor (f) = dottoressa
nurse = infermiera
driver = autista
manager = direttore
worker = lavoratore
farmer = contadino
cook = cuoco
artist = artista
writer = scrittore
reader = lettore
guest = ospite
customer = cliente
seller = venditore
buyer = compratore
police = polizia
officer = ufficiale
guard = guardia
employee = impiegato
cashier = cassiere
guide = guida
player = giocatore
apprentice = apprendista
visitor = visitatore
owner = proprietario
boss = capo
team = squadra
group = gruppo
part = parte
type = tipo
example = esempio
idea = idea
question = domanda
answer = risposta
reason = ragione
problem = problema
plan = piano
story = storia
fact = fatto
truth = verità
lie = bugia
opportunity = opportunità
choice = scelta
result = risultato
change = cambiamento
moment = momento
minute = minuto
hour = ora
day = giorno
week = settimana
month = mese
year = anno
time = tempo
clock = orologio
calendar = calendario
date = data
season = stagione
weather = tempo
sun = sole
moon = luna
star = stella
sky = cielo
cloud = nuvola
rain = pioggia
snow = neve
wind = vento
storm = tempesta
air = aria
fire = fuoco
water = acqua
ice = ghiaccio
earth = terra
stone = pietra
rock = roccia
sand = sabbia
mud = fango
tree = albero
flower = fiore
grass = erba
leaf = foglia
forest = foresta
field = campo
garden = giardino
park = parco
river = fiume
lake = lago
sea = mare
ocean = oceano
beach = spiaggia
island = isola
mountain = montagna
hill = collina
valley = valle
road = strada
highway = autostrada
street = via
bridge = ponte
station = stazione
town = paese
village = villaggio
city = città
country = paese
world = mondo
map = mappa
place = posto
zone = zona
region = regione
north = nord
south = sud
east = est
west = ovest
house = casa
home = casa
room = stanza
room = camera
floor = pavimento
wall = muro
ceiling = soffitto
window = finestra
gate = cancello
hallway = corridoio
stairs = scala
table = tavolo
chair = sedia
bed = letto
lamp = lampada
light = luce
mirror = specchio
shelf = scaffale
box = scatola
key = chiave
lock = serratura
bag = borsa
bottle = bottiglia
cup = tazza
plate = piatto
bowl = ciotola
fork = forchetta
knife = coltello
spoon = cucchiaio
glass = bicchiere
book = libro
paper = carta
letter = lettera
page = pagina
note = nota
sign = cartello
ticket = biglietto
card = carta
phone = telefono
radio = radio
camera = macchina fotografica
screen = schermo
machine = macchina
tool = attrezzo
toy = giocattolo
coin = moneta
money = soldi
price = prezzo
value = valore
store = negozio
market = mercato
bank = banca
hotel = albergo
restaurant = ristorante
cafe = caffè
bar = bar
kitchen = cucina
bathroom = bagno
bedroom = camera da letto
office = ufficio
school = scuola
library = biblioteca
museum = museo
hospital = ospedale
church = chiesa
temple = tempio
farm = fattoria
factory = fabbrica
airport = aeroporto
port = porto
train = treno
bus = autobus
car = macchina
truck = camion
bicycle = bicicletta
boat = barca
airplane = aereo
taxi = taxi
subway = metropolitana
seat = posto
wheel = ruota
animal = animale
dog = cane
cat = gatto
bird = uccello
fish = pesce
horse = cavallo
cow = mucca
pig = maiale
goat = capra
sheep = pecora
chicken = pollo
duck = anatra
rabbit = coniglio
mouse = topo
bear = orso
wolf = lupo
fox = volpe
deer = cervo
monkey = scimmia
lion = leone
tiger = tigre
snake = serpente
frog = rana
bee = ape
butterfly = farfalla
food = cibo
breakfast = colazione
lunch = pranzo
dinner = cena
sandwich = panino
bread = pane
rice = riso
pasta = pasta
meat = carne
egg = uovo
cheese = formaggio
milk = latte
butter = burro
oil = olio
salt = sale
sugar = zucchero
soup = zuppa
salad = insalata
fruit = frutta
apple = mela
banana = banana
orange = arancia
grape = uva
pear = pera
peach = pesca
strawberry = fragola
vegetable = verdura
potato = patata
tomato = pomodoro
onion = cipolla
carrot = carota
bean = fagiolo
corn = mais
pepper = pepe
coffee = caffè
tea = tè
juice = succo
beer = birra
wine = vino
body = corpo
head = testa
face = viso
eye = occhio
ear = orecchio
nose = naso
mouth = bocca
tooth = dente
neck = collo
shoulder = spalla
arm = braccio
hand = mano
finger = dito
chest = petto
back = schiena
stomach = stomaco
leg = gamba
knee = ginocchio
foot = piede
toe = dito del piede
heart = cuore
blood = sangue
skin = pelle
hair = capelli
voice = voce
clothes = vestiti
shirt = camicia
pants = pantaloni
dress = vestito
skirt = gonna
coat = cappotto
jacket = giacca
shoe = scarpa
sock = calzino
hat = cappello
cap = berretto
belt = cintura
glove = guanto
ring = anello
watch = orologio
green = verde
white = bianco
yellow = giallo
brown = marrone
gray = grigio
orange = arancione
pink = rosa
purple = viola
golden = dorato
silver = argentato
good = buono
bad = cattivo
big = grande
tall = alto
short = basso
long = lungo
small = piccolo
young = giovane
old = vecchio
new = nuovo
important = importante
different = diverso
possible = possibile
impossible = impossibile
easy = facile
difficult = difficile
clear = chiaro
dark = scuro
happy = felice
sad = triste
angry = arrabbiato
tired = stanco
hungry = affamato
thirsty = assetato
ready = pronto
busy = occupato
free = libero
safe = sicuro
careful = attento
calm = calmo
noisy = rumoroso
pretty = carino
beautiful = bello
ugly = brutto
rich = ricco
poor = povero
kind = gentile
rude = maleducato
smart = intelligente
silly = sciocco
funny = divertente
serious = serio
strange = strano
normal = normale
natural = naturale
social = sociale
human = umano
real = reale
true = vero
false = falso
useful = utile
necessary = necessario
local = locale
foreign = straniero
native = nativo
public = pubblico
private = privato
special = speciale
common = comune
basic = basico
simple = semplice
hot = caldo
cold = freddo
warm = tiepido
dry = secco
wet = bagnato
soft = morbido
hard = duro
heavy = pesante
light = leggero
strong = forte
weak = debole
fast = veloce
slow = lento
clean = pulito
dirty = sporco
full = pieno
empty = vuoto
open = aperto
closed = chiuso
healthy = sano
sick = malato
to have = avere
I have = ho
has = ha
we have = abbiamo
to do = fare
I do = faccio
does = fa
to take = prendere
I take = prendo
takes = prende
to give = dare
I give = do
gives = dà
to go = andare
I go = vado
goes = va
to come = venire
I come = vengo
comes = viene
to see = vedere
I see = vedo
sees = vede
to look = guardare
I read = leggo
to read = leggere
to write = scrivere
I write = scrivo
to say = dire
I say = dico
to speak = parlare
I speak = parlo
to listen = ascoltare
to hear = sentire
to think = pensare
I think = penso
to know = sapere
I know = so
to know = conoscere
I understand = capisco
to understand = capire
to remember = ricordare
to forget = dimenticare
to learn = imparare
to teach = insegnare
to study = studiare
to practice = praticare
to work = lavorare
to play = giocare
to run = correre
to walk = camminare
to sit = sedere
to sit down = sedersi
to stop = fermare
to wait = aspettare
to start = iniziare
to begin = cominciare
to finish = finire
to continue = continuare
to open = aprire
to close = chiudere
to turn = girare
to move = muovere
to carry = portare
to bring = portare
to send = mandare
to receive = ricevere
to save = salvare
to hold = tenere
to put = mettere
to leave = lasciare
to pick up = raccogliere
to drop = lasciar cadere
to cut = tagliare
to break = rompere
to fix = aggiustare
to build = costruire
to buy = comprare
to sell = vendere
to pay = pagare
to cost = costare
to eat = mangiare
to drink = bere
to cook = cucinare
to wash = lavare
to clean = pulire
to dress = vestire
to change = cambiare
to choose = scegliere
to show = mostrare
to hide = nascondere
to call = chiamare
to ask = chiedere
to answer = rispondere
to use = usare
to need = avere bisogno
to want = volere
to like = piacere
to love = amare
to hate = odiare
to hope = sperare
to try = provare
to lose = perdere
to find = trovare
to meet = incontrare
to visit = visitare
to travel = viaggiare
to arrive = arrivare
to return = tornare
to follow = seguire
to guide = guidare
to win = vincere
to grow = crescere
to fall = cadere
to catch = prendere
to throw = lanciare
to touch = toccare
to push = spingere
to pull = tirare
to sleep = dormire
to wake = svegliarsi
to dream = sognare
to smile = sorridere
to laugh = ridere
to cry = piangere
to sing = cantare
to dance = ballare
to draw = disegnare
to paint = dipingere
to compare = confrontare
to check = controllare
to explain = spiegare
to describe = descrivere
to decide = decidere
to prefer = preferire
to accept = accettare
to agree = essere d'accordo
to believe = credere
to doubt = dubitare
to feel = sentire
to seem = sembrare
to become = diventare
to remain = rimanere
to happen = succedere
to live = vivere
to care = curare
to share = condividere
to join = unirsi
to leave = partire
to search = cercare
good morning = buongiorno
good afternoon = buon pomeriggio
good evening = buonasera
good night = buonanotte
see you later = a dopo
see you soon = a presto
you are welcome = prego
please = per favore
thank you = grazie
thank you very much = grazie mille
excuse me = scusi
sorry = scusa
I am sorry = mi dispiace
I don't know = non lo so
I understand = capisco
I don't understand = non capisco
I need help = ho bisogno di aiuto
I am ready = sono pronto
I am here = sono qui
I am late = sono in ritardo
what time = che ora
which = quale
which is = qual è
how much = quanto
how many = quanti
come in = entra
go out = esci
sit down = siediti
stand up = alzati
turn left = gira a sinistra
turn right = gira a destra
right there = proprio lì
right here = proprio qui
next to = accanto a
near = vicino
far = lontano
on time = in orario
in front = davanti
behind = dietro
on top = sopra
at home = a casa
at work = al lavoro
at school = a scuola
in town = in città
by train = in treno
by bus = in autobus
by car = in macchina
on foot = a piedi
for now = per ora
not yet = non ancora
not anymore = non più
at least = almeno
at most = al massimo
little by little = poco a poco
again = di nuovo
it's okay = va bene
it doesn't matter = non importa
take care = abbi cura
be careful = stai attento
stay safe = stai al sicuro
come back = torna
go ahead = avanti
wait = aspetta
wait here = aspetta qui
watch out = attenzione
come with me = vieni con me
follow me = seguimi
show me = mostrami
tell me = dimmi
let me know = fammi sapere
make sure = assicurati
find out = scopri
pick up = raccogli
save = salva
look around = guardati intorno
look inside = guarda dentro
look outside = guarda fuori
write = scrivi
read aloud = leggi ad alta voce
listen well = ascolta bene
pay attention = presta attenzione
turn around = girati
slowly = piano
faster = più veloce
come closer = avvicinati
stay there = resta lì
right now = adesso
some day = un giorno
every day = ogni giorno
last night = ieri sera
this morning = stamattina
next week = la prossima settimana
last year = l'anno scorso
at first = all'inizio
in fact = infatti
as always = come sempre
for example = per esempio
by the way = a proposito
in the end = alla fine
immediately = subito
in time = in tempo
out of time = senza tempo
on purpose = apposta
by accident = per sbaglio
most of = la maggior parte
part of = parte di
kind of = tipo di
once more = ancora una volta
one more = uno in più
one less = uno in meno
`);

export const ITALIAN_SHARED_LEXICON: LexiconPack = buildSeededSharedLexicon(
  'it',
  ITALIAN_EXPLICIT_ENTRIES,
  ITALIAN_COMMON_WORDS,
);
