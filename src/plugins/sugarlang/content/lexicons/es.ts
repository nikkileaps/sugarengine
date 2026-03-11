import type { LexiconEntry, LexiconPack } from '../../types';
import { buildSeededSharedLexicon, splitWordPairs } from './shared';

const SPANISH_EXPLICIT_ENTRIES: LexiconEntry[] = [
  {
    lexicalEntryId: 'phrase.hello',
    targetForm: 'hola',
    gloss: 'hello',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.my_name_is',
    targetForm: 'me llamo',
    gloss: 'my name is',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.i_am',
    targetForm: 'soy',
    gloss: 'I am',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.good_morning',
    targetForm: 'buenos días',
    alternates: ['buenos dias'],
    gloss: 'good morning',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.thank_you',
    targetForm: 'gracias',
    alternates: ['muchas gracias'],
    gloss: 'thank you',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.please',
    targetForm: 'por favor',
    gloss: 'please',
    category: 'phrase',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.suitcase',
    targetForm: 'maleta',
    alternates: ['maletas'],
    gloss: 'suitcase',
    category: 'object',
    introductionBand: 'B0',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'color.red',
    targetForm: 'roja',
    alternates: ['rojo'],
    gloss: 'red',
    category: 'color',
    introductionBand: 'B0',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'affirmation.yes',
    targetForm: 'si',
    alternates: ['sí'],
    gloss: 'yes',
    category: 'function',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'color.blue',
    targetForm: 'azul',
    gloss: 'blue',
    category: 'color',
    introductionBand: 'B1',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'location.here',
    targetForm: 'aqui',
    alternates: ['aquí', 'aca', 'acá'],
    gloss: 'here',
    category: 'location',
    introductionBand: 'B1',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'location.there',
    targetForm: 'alli',
    alternates: ['allí', 'alla', 'allá'],
    gloss: 'there',
    category: 'location',
    introductionBand: 'B1',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'verb.is_located',
    targetForm: 'esta',
    alternates: ['está'],
    gloss: 'is / is located',
    category: 'verb',
    introductionBand: 'B1',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'color.black',
    targetForm: 'negra',
    alternates: ['negro'],
    gloss: 'black',
    category: 'color',
    introductionBand: 'B2',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'object.door',
    targetForm: 'puerta',
    alternates: ['puertas'],
    gloss: 'door',
    category: 'object',
    introductionBand: 'B2',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'verb.help',
    targetForm: 'ayudar',
    alternates: ['ayuda', 'ayudarme', 'ayudame'],
    gloss: 'help',
    category: 'verb',
    introductionBand: 'B2',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.where_is',
    targetForm: 'donde esta',
    alternates: ['dónde está', 'donde está', 'dónde esta'],
    gloss: 'where is',
    category: 'phrase',
    introductionBand: 'B2',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'adjective.small',
    targetForm: 'pequena',
    alternates: ['pequeña', 'pequeno', 'pequeño'],
    gloss: 'small',
    category: 'adjective',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.counter',
    targetForm: 'mostrador',
    alternates: ['mostradores'],
    gloss: 'counter',
    category: 'object',
    introductionBand: 'B3',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'location.beside',
    targetForm: 'al lado de',
    alternates: ['al lado del', 'al lado'],
    gloss: 'beside / next to',
    category: 'location',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.ribbon_green',
    targetForm: 'cinta verde',
    alternates: ['cinta'],
    gloss: 'green ribbon',
    category: 'object',
    introductionBand: 'B3',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'verb.look_for',
    targetForm: 'buscar',
    alternates: ['busco', 'buscando'],
    gloss: 'look for',
    category: 'verb',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'verb.find',
    targetForm: 'encontrar',
    alternates: ['encuentro', 'encontre', 'encontré'],
    gloss: 'find',
    category: 'verb',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'location.platform',
    targetForm: 'anden',
    alternates: ['andén', 'andenes'],
    gloss: 'platform',
    category: 'location',
    introductionBand: 'B4',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'adjective.leather',
    targetForm: 'de cuero',
    alternates: ['cuero'],
    gloss: 'leather',
    category: 'adjective',
    introductionBand: 'B4',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'adjective.worn',
    targetForm: 'gastada',
    alternates: ['gastado', 'desgastada'],
    gloss: 'worn',
    category: 'adjective',
    introductionBand: 'B4',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.side_door',
    targetForm: 'puerta lateral',
    alternates: ['puerta del lado'],
    gloss: 'side door',
    category: 'object',
    introductionBand: 'B4',
    usage: 'active',
    groundable: true,
  },
];

// Format: english gloss = spanish target form
const SPANISH_COMMON_WORDS = splitWordPairs(`
of = de
the = la
that = que
the = el
in = en
and = y
to = a
the = los
of the = del
itself = se
the = las
for = por
a = un
for = para
with = con
no = no
a = una
his/her = su
to the = al
it = lo
like = como
more = mas
but = pero
their = sus
him = le
already = ya
or = o
this = este
if = si
because = porque
this = esta
between = entre
when = cuando
very = muy
without = sin
about = sobre
also = tambien
me = me
until = hasta
there is = hay
where = donde
who = quien
from = desde
all = todo
us = nos
during = durante
all = todos
one = uno
them = les
neither = ni
against = contra
others = otros
that = ese
that = eso
before = ante
they = ellos
this = esto
my = mi
before = antes
some = algunos
that = que
some = unos
I = yo
another = otro
other = otras
other = otra
the same = el mismo
so much = tanto
that = esa
these = estos
much = mucho
who = quienes
nothing = nada
many = muchos
which = cual
little = poco
she = ella
to be = estar
these = estas
some = algunas
something = algo
we = nosotros
I look = miro
my = mis
you = tu
you = te
you = ti
your = tus
you (formal) = usted
you all (formal) = ustedes
you all = vosotros
you all (f) = vosotras
you (informal) = vos
he = él
she = ella
they (f) = ellas
they = ellos
our = nuestro
our (f) = nuestra
our (pl) = nuestros
our (f pl) = nuestras
your (pl) = vuestro
your (f pl) = vuestra
your (pl) = vuestros
your (f pl) = vuestras
hers = suya
his = suyo
theirs = suyos
theirs (f) = suyas
here = aqui
there = alli
over there = alla
here = aca
there = ahi
today = hoy
yesterday = ayer
tomorrow = manana
now = ahora
always = siempre
never = nunca
sometimes = a veces
already = ya
still = todavia
even = aun
then = luego
then = entonces
after = despues
before = antes
soon = pronto
late = tarde
early = temprano
maybe = tal vez
perhaps = quizas
perhaps = quizá
really = realmente
almost = casi
only = solo
only = solamente
even = incluso
also = tambien
besides = ademas
less = menos
more = mas
better = mejor
worse = peor
same = igual
another = otro
new = nuevo
old = viejo
good = bueno
bad = malo
big = grande
tall = alto
short = bajo
long = largo
short = corto
small = pequeño
young = joven
important = importante
different = diferente
possible = posible
impossible = imposible
easy = facil
difficult = difícil
clear = claro
dark = oscuro
happy = feliz
sad = triste
angry = enojado
tired = cansado
hungry = hambriento
thirsty = sediento
ready = listo
busy = ocupado
free = libre
safe = seguro
careful = cuidadoso
calm = tranquilo
noisy = ruidoso
pretty = bonito
beautiful = hermoso
ugly = feo
rich = rico
poor = pobre
kind = amable
rude = grosero
smart = inteligente
silly = tonto
funny = gracioso
serious = serio
strange = extraño
normal = normal
natural = natural
social = social
human = humano
real = real
true = verdadero
false = falso
useful = util
necessary = necesario
possible = posible
local = local
foreign = extranjero
native = nativo
public = publico
private = privado
special = especial
common = comun
basic = basico
simple = simple
hot = caliente
cold = frio
warm = tibio
dry = seco
wet = mojado
soft = suave
hard = duro
heavy = pesado
light = ligero
strong = fuerte
weak = debil
fast = rapido
slow = lento
clean = limpio
dirty = sucio
full = lleno
empty = vacio
open = abierto
closed = cerrado
healthy = saludable
sick = enfermo
green = verde
white = blanco
yellow = amarillo
brown = marron
gray = gris
orange = naranja
pink = rosa
purple = morado
golden = dorado
silver = plateado
person = persona
people = gente
man = hombre
woman = mujer
child = nino
girl = niña
boy = niño
family = familia
mother = madre
father = padre
mom = mama
dad = papá
parents = padres
brother = hermano
sister = hermana
son = hijo
daughter = hija
grandmother = abuela
grandfather = abuelo
uncle = tio
aunt = tia
cousin (m) = primo
cousin (f) = prima
friend (m) = amigo
friend (f) = amiga
neighbor (m) = vecino
neighbor (f) = vecina
teacher = maestro
professor = profesor
professor (f) = profesora
student = estudiante
doctor = doctor
doctor (f) = doctora
nurse = enfermera
driver = conductor
manager = gerente
worker = trabajador
farmer = granjero
cook = cocinero
artist = artista
writer = escritor
reader = lector
guest = invitado
customer = cliente
seller = vendedor
buyer = comprador
police = policia
officer = oficial
guard = guardia
employee = empleado
cashier = cajero
guide = guia
player = jugador
apprentice = aprendiz
visitor = visitante
owner = dueno
owner = dueño
boss = jefe
team = equipo
group = grupo
part = parte
type = tipo
example = ejemplo
idea = idea
question = pregunta
answer = respuesta
reason = razon
problem = problema
plan = plan
story = historia
fact = hecho
truth = verdad
lie = mentira
opportunity = oportunidad
choice = eleccion
result = resultado
change = cambio
moment = momento
minute = minuto
hour = hora
day = dia
week = semana
month = mes
year = ano
year = año
time = tiempo
clock = reloj
calendar = calendario
date = fecha
season = estacion
spring = primavera
summer = verano
autumn = otono
autumn = otoño
winter = invierno
weather = clima
sun = sol
moon = luna
star = estrella
sky = cielo
cloud = nube
rain = lluvia
snow = nieve
wind = viento
storm = tormenta
air = aire
fire = fuego
water = agua
ice = hielo
earth = tierra
stone = piedra
rock = roca
sand = arena
mud = barro
tree = arbol
tree = árbol
flower = flor
grass = hierba
leaf = hoja
forest = bosque
field = campo
garden = jardin
garden = jardín
park = parque
river = rio
river = río
lake = lago
sea = mar
ocean = oceano
ocean = océano
beach = playa
island = isla
mountain = montana
mountain = montaña
hill = colina
valley = valle
road = camino
highway = carretera
street = calle
bridge = puente
station = estacion
town = pueblo
village = aldea
city = ciudad
country = pais
country = país
world = mundo
map = mapa
place = lugar
zone = zona
region = region
region = región
north = norte
south = sur
east = este
west = oeste
house = casa
home = hogar
room = cuarto
room = habitacion
room = habitación
floor = piso
wall = pared
ceiling = techo
window = ventana
gate = porton
gate = portón
hallway = pasillo
stairs = escalera
table = mesa
chair = silla
bed = cama
lamp = lampara
lamp = lámpara
light = luz
mirror = espejo
shelf = estante
box = caja
key = llave
lock = cerradura
bag = bolsa
bottle = botella
cup = taza
plate = plato
bowl = tazon
bowl = tazón
fork = tenedor
knife = cuchillo
spoon = cuchara
glass = vaso
book = libro
paper = papel
letter = carta
page = pagina
page = página
note = nota
sign = letrero
ticket = boleto
card = tarjeta
phone = telefono
phone = teléfono
radio = radio
camera = camara
camera = cámara
screen = pantalla
machine = maquina
machine = máquina
tool = herramienta
toy = juguete
coin = moneda
money = dinero
price = precio
value = valor
store = tienda
market = mercado
bank = banco
hotel = hotel
restaurant = restaurante
cafe = cafe
cafe = café
bar = bar
kitchen = cocina
bathroom = bano
bathroom = baño
bedroom = dormitorio
office = oficina
school = escuela
library = biblioteca
museum = museo
hospital = hospital
church = iglesia
temple = templo
farm = granja
factory = fabrica
factory = fábrica
airport = aeropuerto
port = puerto
train = tren
bus = autobus
bus = autobús
car = coche
car = carro
truck = camion
truck = camión
bicycle = bicicleta
boat = barco
airplane = avion
airplane = avión
taxi = taxi
subway = metro
seat = asiento
wheel = rueda
animal = animal
dog = perro
cat = gato
bird = pajaro
bird = pájaro
fish = pez
horse = caballo
cow = vaca
pig = cerdo
goat = cabra
sheep = oveja
chicken = pollo
duck = pato
rabbit = conejo
mouse = raton
mouse = ratón
bear = oso
wolf = lobo
fox = zorro
deer = ciervo
monkey = mono
lion = leon
lion = león
tiger = tigre
snake = serpiente
frog = rana
bee = abeja
butterfly = mariposa
food = comida
breakfast = desayuno
lunch = almuerzo
dinner = cena
sandwich = bocadillo
bread = pan
rice = arroz
pasta = pasta
meat = carne
fish = pescado
egg = huevo
cheese = queso
milk = leche
butter = mantequilla
oil = aceite
salt = sal
sugar = azucar
sugar = azúcar
soup = sopa
salad = ensalada
fruit = fruta
apple = manzana
banana = banana
orange = naranja
grape = uva
pear = pera
peach = durazno
peach = melocoton
peach = melocotón
strawberry = fresa
vegetable = verdura
potato = patata
potato = papa
tomato = tomate
onion = cebolla
carrot = zanahoria
bean = frijol
corn = maiz
corn = maíz
pepper = pimienta
coffee = cafe
tea = té
tea = te
juice = jugo
beer = cerveza
wine = vino
body = cuerpo
head = cabeza
face = cara
eye = ojo
ear = oreja
nose = nariz
mouth = boca
tooth = diente
neck = cuello
shoulder = hombro
arm = brazo
hand = mano
finger = dedo
chest = pecho
back = espalda
stomach = estomago
stomach = estómago
leg = pierna
knee = rodilla
foot = pie
toe = dedo del pie
heart = corazon
heart = corazón
blood = sangre
skin = piel
hair = pelo
voice = voz
clothes = ropa
shirt = camisa
pants = pantalon
pants = pantalón
dress = vestido
skirt = falda
coat = abrigo
jacket = chaqueta
shoe = zapato
sock = calcetin
sock = calcetín
hat = sombrero
cap = gorra
belt = cinturon
belt = cinturón
glove = guante
ring = anillo
watch = reloj
to have = tener
I have = tengo
has = tiene
we have = tenemos
to do = hacer
I do = hago
does = hace
to do it = hacerlo
to take = tomar
I take = tomo
takes = toma
to give = dar
I give = doy
gives = da
to obtain = obtener
to get = conseguir
to go = ir
I go = voy
goes = va
to come = venir
I come = vengo
comes = viene
to see = ver
I see = veo
sees = ve
to look = mirar
I read = leo
to read = leer
to write = escribir
I write = escribo
to say = decir
I say = digo
to speak = hablar
I speak = hablo
to listen = escuchar
to hear = oir
to hear = oír
to think = pensar
I think = pienso
to know = saber
I know = se
to know = conocer
I understand = entiendo
to understand = entender
to remember = recordar
to forget = olvidar
to learn = aprender
to teach = ensenar
to teach = enseñar
to study = estudiar
to practice = practicar
to work = trabajar
to play = jugar
to run = correr
to walk = caminar
to walk = andar
to sit = sentar
to sit down = sentarse
to stop = parar
to wait = esperar
to start = empezar
to begin = comenzar
to finish = terminar
to continue = continuar
to open = abrir
to close = cerrar
to turn = girar
to move = mover
to carry = llevar
to bring = traer
to send = enviar
to receive = recibir
to save = guardar
to hold = sostener
to put = poner
to leave = dejar
to pick up = recoger
to drop = soltar
to cut = cortar
to break = romper
to fix = arreglar
to build = construir
to buy = comprar
to sell = vender
to pay = pagar
to cost = costar
to eat = comer
to drink = beber
to cook = cocinar
to wash = lavar
to clean = limpiar
to dress = vestir
to change = cambiar
to choose = elegir
to show = mostrar
to hide = esconder
to call = llamar
to ask = preguntar
to answer = responder
to use = usar
to need = necesitar
to want = querer
to like = gustar
to love = amar
to hate = odiar
to hope = esperar
to try = intentar
to lose = perder
to find = encontrar
to meet = conocer
to visit = visitar
to travel = viajar
to arrive = llegar
to return = regresar
to follow = seguir
to guide = guiar
to win = ganar
to grow = crecer
to fall = caer
to catch = atrapar
to throw = lanzar
to touch = tocar
to push = empujar
to pull = jalar
to sleep = dormir
to wake = despertar
to dream = sonar
to dream = soñar
to smile = sonreir
to smile = sonreír
to laugh = reir
to laugh = reír
to cry = llorar
to sing = cantar
to dance = bailar
to draw = dibujar
to paint = pintar
to compare = comparar
to check = revisar
to explain = explicar
to describe = describir
to decide = decidir
to prefer = preferir
to accept = aceptar
to agree = estar de acuerdo
to believe = creer
to doubt = dudar
to feel = sentir
to seem = parecer
to become = volverse
to remain = permanecer
to happen = pasar
to live = vivir
to care = cuidar
to share = compartir
to join = unirse
to leave = salir
to search = buscar
good morning = buenos dias
good afternoon = buenas tardes
good night = buenas noches
see you later = hasta luego
see you soon = hasta pronto
you are welcome = de nada
please = por favor
thank you = gracias
thank you very much = muchas gracias
excuse me = con permiso
sorry = perdon
I am sorry = lo siento
I don't know = no se
I understand = si entiendo
I don't understand = no entiendo
I need help = necesito ayuda
I am ready = estoy listo
I am here = estoy aqui
I am late = llego tarde
what time = que hora
which = cual
which is = cual es
how much = cuanto
how many = cuantos
come in = entra
go out = sal
sit down = sientate
stand up = levantate
turn left = gira a la izquierda
turn right = gira a la derecha
right there = alla mismo
right here = aqui mismo
next to = al lado
near = cerca
far = lejos
on time = a tiempo
in front = en frente
behind = detras
on top = encima
at home = en casa
at work = en el trabajo
at school = en la escuela
in town = en la ciudad
by train = en tren
by bus = en autobus
by car = en coche
on foot = a pie
for now = por ahora
not yet = todavia no
not anymore = ya no
at least = al menos
at most = como maximo
little by little = poco a poco
again = otra vez
it's okay = esta bien
it doesn't matter = no importa
take care = cuidate
be careful = ten cuidado
stay safe = mantente seguro
come back = vuelve
go ahead = adelante
wait = espera
wait here = espera aqui
watch out = ojo
come with me = ven conmigo
follow me = sigueme
show me = muestrame
tell me = dime
let me know = hazme saber
make sure = asegurate
find out = averigua
pick up = recoge
save = guarda
look around = mira alrededor
look inside = mira dentro
look outside = mira afuera
write = escribe
read aloud = lee en voz alta
listen well = escucha bien
pay attention = presta atencion
turn around = date la vuelta
line up = haz fila
slowly = despacio
faster = mas rapido
come closer = acercate
stay there = quedate ahi
right now = ahora mismo
some day = algun dia
every day = cada dia
last night = anoche
this morning = esta manana
this morning = esta mañana
next week = la semana que viene
last year = el ano pasado
last year = el año pasado
at first = al principio
in fact = de hecho
as always = como siempre
for example = por ejemplo
by the way = por cierto
in the end = al final
immediately = de inmediato
in time = a tiempo
out of time = sin tiempo
on purpose = a proposito
on purpose = a propósito
by accident = por accidente
most of = la mayor parte
part of = parte de
kind of = tipo de
once more = una vez mas
one more = uno mas
one less = uno menos
this = este
that = esa
these days = estos dias
those people = esa gente
my friend = mi amigo
your turn = tu turno
my turn = mi turno
our house = nuestra casa
their house = su casa
their bag = su bolsa
their book = su libro
open it = abrelo
close it = cierralo
take it = tomalo
leave it = dejalo
bring it = traelo
find it = encuentralo
lose it = pierdelo
buy it = compralo
sell it = vendelo
read it = leelo
write it = escribelo
say it = dilo
do it = hazlo
save it = guárdalo
use it = usalo
wash it = lavaló
put it on = ponte
eat it = comelo
drink it = bebelo
look at it = míralo
hear it = oyelo
feel it = siéntelo
move it = muévelo
fix it = arreglalo
`);

export const SPANISH_SHARED_LEXICON: LexiconPack = buildSeededSharedLexicon(
  'es',
  SPANISH_EXPLICIT_ENTRIES,
  SPANISH_COMMON_WORDS,
);
