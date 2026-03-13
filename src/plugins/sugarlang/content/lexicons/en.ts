import type { LexiconEntry, LexiconPack } from '../../types';
import { buildSeededSharedLexicon, splitWordPairs } from './shared';

const ENGLISH_EXPLICIT_ENTRIES: LexiconEntry[] = [
  {
    lexicalEntryId: 'object.suitcase',
    targetForm: 'suitcase',
    alternates: ['luggage', 'bag'],
    gloss: 'maleta',
    category: 'object',
    introductionBand: 'B0',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'color.red',
    targetForm: 'red',
    gloss: 'roja',
    category: 'color',
    introductionBand: 'B0',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'affirmation.yes',
    targetForm: 'yes',
    alternates: ['yeah', 'yep'],
    gloss: 'si',
    category: 'function',
    introductionBand: 'B0',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'color.blue',
    targetForm: 'blue',
    gloss: 'azul',
    category: 'color',
    introductionBand: 'B1',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'location.here',
    targetForm: 'here',
    gloss: 'aqui',
    category: 'location',
    introductionBand: 'B1',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'location.there',
    targetForm: 'there',
    gloss: 'alli',
    category: 'location',
    introductionBand: 'B1',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'verb.is_located',
    targetForm: 'is',
    gloss: 'esta',
    category: 'verb',
    introductionBand: 'B1',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'color.black',
    targetForm: 'black',
    gloss: 'negra',
    category: 'color',
    introductionBand: 'B2',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'object.door',
    targetForm: 'door',
    gloss: 'puerta',
    category: 'object',
    introductionBand: 'B2',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'verb.help',
    targetForm: 'help',
    alternates: ['help me'],
    gloss: 'ayudar',
    category: 'verb',
    introductionBand: 'B2',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'phrase.where_is',
    targetForm: 'where is',
    alternates: ["where's"],
    gloss: 'donde esta',
    category: 'phrase',
    introductionBand: 'B2',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'adjective.small',
    targetForm: 'small',
    alternates: ['little'],
    gloss: 'pequena',
    category: 'adjective',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.counter',
    targetForm: 'counter',
    alternates: ['desk', 'service desk'],
    gloss: 'mostrador',
    category: 'object',
    introductionBand: 'B3',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'location.beside',
    targetForm: 'beside',
    alternates: ['next to', 'near', 'by'],
    gloss: 'al lado de',
    category: 'location',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.ribbon_green',
    targetForm: 'green ribbon',
    alternates: ['ribbon'],
    gloss: 'cinta verde',
    category: 'object',
    introductionBand: 'B3',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'verb.look_for',
    targetForm: 'look for',
    alternates: ['looking for'],
    gloss: 'buscar',
    category: 'verb',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'verb.find',
    targetForm: 'find',
    alternates: ['found'],
    gloss: 'encontrar',
    category: 'verb',
    introductionBand: 'B3',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'location.platform',
    targetForm: 'platform',
    gloss: 'anden',
    category: 'location',
    introductionBand: 'B4',
    usage: 'active',
    groundable: true,
  },
  {
    lexicalEntryId: 'adjective.leather',
    targetForm: 'leather',
    gloss: 'de cuero',
    category: 'adjective',
    introductionBand: 'B4',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'adjective.worn',
    targetForm: 'worn',
    alternates: ['old', 'beat-up'],
    gloss: 'gastada',
    category: 'adjective',
    introductionBand: 'B4',
    usage: 'active',
    groundable: false,
  },
  {
    lexicalEntryId: 'object.side_door',
    targetForm: 'side door',
    alternates: ['side entrance'],
    gloss: 'puerta lateral',
    category: 'object',
    introductionBand: 'B4',
    usage: 'active',
    groundable: true,
  },
];

// Format: spanish gloss = english target form
const ENGLISH_COMMON_WORDS = splitWordPairs(`
el/la = the
de = of
y = and
a = to
en = in
un/una = a
ese/esa = that
para = for
eso = it
en = on
con = with
como = as
en = at
por = by
de = from
ser = be
o = or
son = are
un = an
no = not
tener = have
uno = one
tu = you
yo = i
el = he
ella = she
nosotros = we
ellos = they
hacer = do
pero = but
si = if
poder = can
voluntad = will
todo = all
tu = your
mi = my
su = their
nuestro = our
su = his
su = her
quien = who
que = what
cuando = when
donde = where
por que = why
como = how
entonces = then
que = than
mas = more
sobre = about
arriba = up
fuera = out
solo = just
dentro = into
sobre = over
despues = after
antes = before
porque = because
entre = between
debajo = under
otra vez = again
todavia = still
otro = another
mismo = same
cada = each
cada = every
muy = very
mucho = much
muchos = many
pocos = few
algunos = some
cualquier = any
tambien = also
solo = only
incluso = even
bueno = good
malo = bad
nuevo = new
viejo = old
primero = first
ultimo = last
largo = long
propio = own
otro = other
gran = great
alto = high
grande = large
grande = big
diferente = different
importante = important
joven = young
derecho = right
izquierdo = left
lejos = far
cerca = near
siguiente = next
temprano = early
tarde = late
pronto = soon
hoy = today
manana = tomorrow
ayer = yesterday
ahora = now
siempre = always
nunca = never
a menudo = often
a veces = sometimes
usualmente = usually
quizas = maybe
realmente = really
casi = almost
ya = already
juntos = together
aparte = apart
adentro = inside
afuera = outside
arriba = above
abajo = below
alrededor = around
a traves = through
a traves = across
hacia = toward
contra = against
durante = during
sin = without
dentro de = within
mientras = while
desde = since
hasta = until
aunque = although
sin embargo = though
sin embargo = however
por lo tanto = therefore
en cambio = instead
lejos = away
atras = back
abajo = down
apagado = off
a lo largo = along
una vez = once
dos veces = twice
alguna vez = ever
todavia = yet
si = yes
no = no
por favor = please
gracias = thanks
gracias = thank
perdon = sorry
disculpe = excuse
hola = hello
hola = hi
adios = goodbye
adios = bye
bienvenido = welcome
nombre = name
amigo = friend
persona = person
gente = people
hombre = man
mujer = woman
nino = boy
nina = girl
nino = child
ninos = children
bebe = baby
familia = family
madre = mother
padre = father
mama = mom
papa = dad
padre = parent
hermano = brother
hermana = sister
hijo = son
hija = daughter
esposo = husband
esposa = wife
abuela = grandmother
abuelo = grandfather
tio = uncle
tia = aunt
primo = cousin
vecino = neighbor
maestro = teacher
estudiante = student
doctor = doctor
enfermera = nurse
conductor = driver
gerente = manager
trabajador = worker
granjero = farmer
chef = chef
cocinero = cook
artista = artist
escritor = writer
lector = reader
invitado = guest
cliente = customer
vendedor = seller
comprador = buyer
policia = police
oficial = officer
guardia = guard
empleado = clerk
cajero = cashier
guia = guide
jugador = player
aprendiz = learner
visitante = visitor
dueno = owner
jefe = boss
equipo = team
grupo = group
lado = side
parte = part
clase = kind
tipo = type
ejemplo = example
idea = idea
pregunta = question
respuesta = answer
razon = reason
problema = problem
asunto = issue
plan = plan
historia = story
historia = history
hecho = fact
verdad = truth
mentira = lie
oportunidad = chance
eleccion = choice
resultado = result
cambio = change
momento = moment
minuto = minute
hora = hour
dia = day
semana = week
mes = month
ano = year
manana = morning
tarde = afternoon
tarde = evening
noche = night
tiempo = time
reloj = clock
reloj = watch
calendario = calendar
fecha = date
temporada = season
primavera = spring
verano = summer
otono = autumn
otono = fall
invierno = winter
clima = weather
sol = sun
luna = moon
estrella = star
cielo = sky
nube = cloud
lluvia = rain
nieve = snow
viento = wind
tormenta = storm
aire = air
fuego = fire
agua = water
hielo = ice
tierra = earth
suelo = ground
piedra = stone
roca = rock
arena = sand
barro = mud
arbol = tree
flor = flower
hierba = grass
hoja = leaf
bosque = forest
campo = field
jardin = garden
parque = park
rio = river
lago = lake
mar = sea
oceano = ocean
playa = beach
isla = island
montana = mountain
colina = hill
valle = valley
carretera = road
calle = street
sendero = path
puente = bridge
estacion = station
pueblo = town
aldea = village
ciudad = city
pais = country
mundo = world
mapa = map
lugar = place
area = area
region = region
norte = north
sur = south
este = east
oeste = west
hogar = home
casa = house
cuarto = room
piso = floor
pared = wall
techo = roof
ventana = window
puerta = gate
pasillo = hall
escaleras = stairs
escalon = step
mesa = table
silla = chair
cama = bed
lampara = lamp
luz = light
espejo = mirror
estante = shelf
caja = box
llave = key
cerradura = lock
bolsa = bag
botella = bottle
taza = cup
plato = plate
tazon = bowl
tenedor = fork
cuchillo = knife
cuchara = spoon
vaso = glass
libro = book
papel = paper
carta = letter
pagina = page
nota = note
letrero = sign
boleto = ticket
tarjeta = card
telefono = phone
radio = radio
camara = camera
pantalla = screen
maquina = machine
herramienta = tool
juguete = toy
moneda = coin
dinero = money
precio = price
costo = cost
valor = value
tienda = shop
tienda = store
mercado = market
banco = bank
hotel = hotel
restaurante = restaurant
cafe = cafe
bar = bar
cocina = kitchen
bano = bathroom
dormitorio = bedroom
oficina = office
escuela = school
biblioteca = library
museo = museum
hospital = hospital
iglesia = church
templo = temple
granja = farm
fabrica = factory
aeropuerto = airport
puerto = port
puerto = harbor
tren = train
autobus = bus
coche = car
camion = truck
bicicleta = bike
bicicleta = bicycle
barco = boat
barco = ship
avion = plane
taxi = taxi
metro = subway
carretera = roadway
conductor = driver
asiento = seat
rueda = wheel
entrada = doorway
animal = animal
perro = dog
gato = cat
pajaro = bird
pez = fish
caballo = horse
vaca = cow
cerdo = pig
cabra = goat
oveja = sheep
pollo = chicken
pato = duck
conejo = rabbit
raton = mouse
oso = bear
lobo = wolf
zorro = fox
ciervo = deer
mono = monkey
leon = lion
tigre = tiger
serpiente = snake
rana = frog
abeja = bee
mariposa = butterfly
comida = food
comida = meal
desayuno = breakfast
almuerzo = lunch
cena = dinner
bocadillo = snack
pan = bread
arroz = rice
pasta = pasta
carne = meat
pescado = fish
huevo = egg
queso = cheese
leche = milk
mantequilla = butter
aceite = oil
sal = salt
azucar = sugar
sopa = soup
ensalada = salad
fruta = fruit
manzana = apple
banana = banana
naranja = orange
uva = grape
pera = pear
durazno = peach
fresa = berry
fresa = strawberry
verdura = vegetable
patata = potato
tomate = tomato
cebolla = onion
zanahoria = carrot
frijol = bean
maiz = corn
pimienta = pepper
cafe = coffee
te = tea
jugo = juice
agua = water
cerveza = beer
vino = wine
cuerpo = body
cabeza = head
cara = face
ojo = eye
oreja = ear
nariz = nose
boca = mouth
diente = tooth
cuello = neck
hombro = shoulder
brazo = arm
mano = hand
dedo = finger
pecho = chest
espalda = back
estomago = stomach
pierna = leg
rodilla = knee
pie = foot
dedo del pie = toe
corazon = heart
sangre = blood
piel = skin
pelo = hair
voz = voice
ropa = clothes
camisa = shirt
pantalon = pants
pantalon = trousers
vestido = dress
falda = skirt
abrigo = coat
chaqueta = jacket
zapato = shoe
calcetin = sock
sombrero = hat
gorra = cap
cinturon = belt
guante = glove
anillo = ring
reloj = watch
color = color
blanco = white
verde = green
amarillo = yellow
marron = brown
gris = gray
gris = grey
naranja = orange
rosa = pink
morado = purple
dorado = gold
plateado = silver
limpio = clean
sucio = dirty
lleno = full
vacio = empty
abierto = open
cerrado = closed
caliente = hot
frio = cold
tibio = warm
fresco = cool
seco = dry
mojado = wet
suave = soft
duro = hard
pesado = heavy
ligero = light
fuerte = strong
debil = weak
rapido = fast
lento = slow
facil = easy
dificil = difficult
sencillo = simple
claro = clear
oscuro = dark
brillante = bright
feliz = happy
triste = sad
enojado = angry
asustado = afraid
cansado = tired
hambriento = hungry
sediento = thirsty
saludable = healthy
enfermo = sick
listo = ready
ocupado = busy
libre = free
seguro = safe
cuidadoso = careful
tranquilo = quiet
ruidoso = loud
hermoso = beautiful
bonito = pretty
feo = ugly
rico = rich
pobre = poor
amable = kind
cruel = mean
educado = polite
grosero = rude
inteligente = smart
tonto = stupid
gracioso = funny
serio = serious
extrano = strange
normal = normal
posible = possible
imposible = impossible
local = local
extranjero = foreign
nativo = native
publico = public
privado = private
especial = special
comun = common
basico = basic
simple = simple
natural = natural
social = social
humano = human
real = real
verdadero = true
falso = false
capaz = able
util = useful
necesario = necessary
tener = have
tiene = has
tenia = had
hacer = make
hace = makes
hizo = made
tomar = take
toma = takes
tomo = took
dar = give
da = gives
dio = gave
obtener = get
obtiene = gets
obtuvo = got
ir = go
va = goes
fue = went
venir = come
viene = comes
vino = came
ver = see
ve = sees
vio = saw
mirar = look
mira = looks
miro = looked
ver = watch
ve = watches
leer = read
lee = reads
escribir = write
escribe = writes
escribio = wrote
decir = say
dice = says
dijo = said
decir = tell
dice = tells
dijo = told
hablar = speak
habla = speaks
escuchar = listen
oye = hears
oir = hear
oyo = heard
pensar = think
piensa = thinks
penso = thought
saber = know
sabe = knows
sabia = knew
entender = understand
recordar = remember
olvidar = forget
aprender = learn
ensenar = teach
estudiar = study
practicar = practice
trabajar = work
trabaja = works
trabajo = worked
jugar = play
juega = plays
jugo = played
correr = run
corre = runs
caminar = walk
camina = walks
camino = walked
sentar = sit
sienta = sits
sento = sat
parar = stand
para = stands
paro = stood
quedar = stay
queda = stays
dejar = left
dejar = leave
deja = leaves
esperar = wait
empezar = start
comenzar = begin
terminar = finish
terminar = end
parar = stop
continuar = continue
abrir = open
cerrar = close
girar = turn
mover = move
llevar = carry
traer = bring
enviar = send
recibir = receive
guardar = keep
sostener = hold
poner = put
poner = set
recoger = pick
soltar = drop
cortar = cut
romper = break
arreglar = fix
construir = build
comprar = buy
vender = sell
pagar = pay
costar = cost
comer = eat
beber = drink
cocinar = cook
lavar = wash
limpiar = clean
vestir = wear
cambiar = change
elegir = choose
mostrar = show
esconder = hide
llamar = call
preguntar = ask
responder = answer
ayudar = help
usar = use
necesitar = need
querer = want
gustar = like
amar = love
odiar = hate
esperar = hope
desear = wish
intentar = try
encontrar = find
perder = lose
conocer = meet
visitar = visit
viajar = travel
llegar = arrive
regresar = return
seguir = follow
guiar = lead
ganar = win
crecer = grow
caer = fall
atrapar = catch
lanzar = throw
tocar = touch
empujar = push
jalar = pull
dormir = sleep
despertar = wake
sonar = dream
sonreir = smile
reir = laugh
llorar = cry
cantar = sing
bailar = dance
dibujar = draw
pintar = paint
comparar = compare
revisar = check
explicar = explain
describir = describe
decidir = decide
elegir = choose
preferir = prefer
aceptar = agree
no estar de acuerdo = disagree
creer = believe
dudar = doubt
sentir = feel
parecer = seem
volverse = become
permanecer = remain
pasar = happen
vivir = live
cuidar = care
compartir = share
unirse = join
salir = leave
buscar = search
buenos dias = good morning
buenas tardes = good afternoon
buenas tardes = good evening
buenas noches = good night
nos vemos = see you
hasta luego = see you later
enseguida = right away
por supuesto = of course
no hay problema = no problem
seguro = for sure
por favor ayuda = please help
gracias = thank you
de nada = you are welcome
disculpe = excuse me
lo siento = i am sorry
no se = i do not know
entiendo = i understand
no entiendo = i do not understand
necesito ayuda = i need help
estoy listo = i am ready
estoy aqui = i am here
estoy tarde = i am late
que hora = what time
cual = which one
cuanto = how much
cuantos = how many
entra = come in
sal = go out
sientate = sit down
levantate = stand up
gira a la izquierda = turn left
gira a la derecha = turn right
alla = over there
aqui mismo = right here
al lado = next door
cerca = nearby
lejos = far away
a tiempo = on time
en frente = in front
detras de mi = behind me
encima = on top
en casa = at home
en el trabajo = at work
en la escuela = at school
en la ciudad = in town
en tren = by train
en autobus = by bus
en coche = by car
a pie = on foot
por ahora = for now
todavia no = not yet
ya no = any more
ya no = no longer
al menos = at least
como maximo = at most
poco a poco = little by little
otra vez = once again
esta bien = all right
no importa = never mind
cuidate = take care
ten cuidado = be careful
mantente seguro = stay safe
vuelve = come back
adelante = go ahead
espera = hold on
espera aqui = wait here
cuidado = look out
ojo = watch out
ven conmigo = come with me
sigueme = follow me
muestrame = show me
dime = tell me
hazme saber = let me know
asegurate = make sure
averigua = find out
recoge = pick up
guarda = put away
mira alrededor = look around
mira adentro = look inside
mira afuera = look outside
escribe = write down
lee en voz alta = read aloud
escucha bien = listen carefully
presta atencion = pay attention
date la vuelta = turn around
haz fila = line up
mas despacio = slow down
mas rapido = speed up
acercate = come closer
mas rapido = go faster
quedate ahi = stay there
ahora mismo = right now
algun dia = some day
cada dia = every day
anoche = last night
esta manana = this morning
la semana que viene = next week
el ano pasado = last year
al principio = at first
de hecho = in fact
como siempre = as usual
por ejemplo = for example
por cierto = by the way
al final = in the end
de inmediato = at once
a tiempo = in time
sin tiempo = out of time
a proposito = on purpose
por accidente = by accident
de todo = of all
la mayoria = most of
parte de = part of
tipo de = kind of
tipo de = sort of
uno mas = one more
uno menos = one less
este = this one
ese = that one
estos dias = these days
esa gente = those people
mi amigo = my friend
tu turno = your turn
mi turno = my turn
nuestro hogar = our home
su casa = their house
su bolsa = his bag
su libro = her book
abrelo = open it
cierralo = close it
tomalo = take it
dejalo = leave it
traelo = bring it
llevalo = carry it
encuentralo = find it
pierdelo = lose it
compralo = buy it
vendelo = sell it
leelo = read it
escribelo = write it
dilo = say it
hazlo = do it
hazlo = make it
guardalo = keep it
usalo = use it
lavalo = wash it
pontelo = wear it
comelo = eat it
bebelo = drink it
miralo = watch it
oyelo = hear it
sientelo = feel it
muevelo = move it
ponlo = set it
arreglalo = fix it
`);

export const ENGLISH_SHARED_LEXICON: LexiconPack = buildSeededSharedLexicon(
  'en',
  ENGLISH_EXPLICIT_ENTRIES,
  ENGLISH_COMMON_WORDS,
);
