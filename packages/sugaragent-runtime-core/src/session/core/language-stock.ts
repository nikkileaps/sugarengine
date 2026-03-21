function normalizeLanguageCode(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return 'default';
  return value.trim().toLowerCase().split(/[-_]/)[0] ?? 'default';
}

interface SocialTemplateVars {
  npcName?: string;
  playerName?: string;
}

export function localizeGroundedReplyExemplar(
  key: 'grounded' | 'inferred' | 'rumor' | 'uncertain',
  targetLanguage?: unknown,
): string {
  const language = normalizeLanguageCode(targetLanguage);

  if (language === 'es') {
    switch (key) {
      case 'grounded': return 'Estamos en la estacion ahora.';
      case 'inferred': return 'Creo que el hotel esta cerca.';
      case 'rumor': return 'Oi que la estacion cierra temprano.';
      case 'uncertain': return 'No lo se.';
    }
  }

  if (language === 'fr') {
    switch (key) {
      case 'grounded': return 'Nous sommes a la gare maintenant.';
      case 'inferred': return "Je pense que l'hotel est proche.";
      case 'rumor': return "J'ai entendu dire que la gare ferme tot.";
      case 'uncertain': return 'Je ne sais pas.';
    }
  }

  if (language === 'de') {
    switch (key) {
      case 'grounded': return 'Wir sind jetzt am Bahnhof.';
      case 'inferred': return 'Ich glaube, das Hotel ist in der Naehe.';
      case 'rumor': return 'Ich habe gehoert, dass der Bahnhof frueh schliesst.';
      case 'uncertain': return 'Ich weiss es nicht.';
    }
  }

  if (language === 'it') {
    switch (key) {
      case 'grounded': return 'Siamo alla stazione adesso.';
      case 'inferred': return "Credo che l'hotel sia vicino.";
      case 'rumor': return 'Ho sentito che la stazione chiude presto.';
      case 'uncertain': return 'Non lo so.';
    }
  }

  if (language === 'pt') {
    switch (key) {
      case 'grounded': return 'Estamos na estacao agora.';
      case 'inferred': return 'Acho que o hotel fica perto.';
      case 'rumor': return 'Ouvi dizer que a estacao fecha cedo.';
      case 'uncertain': return 'Nao sei.';
    }
  }

  switch (key) {
    case 'grounded': return 'We are at the station right now.';
    case 'inferred': return 'I think the hotel is nearby.';
    case 'rumor': return 'I heard that the station closes early.';
    case 'uncertain': return "I don't know.";
  }
}

export function localizeGroundedUncertaintyReply(
  queryType: unknown,
  targetLanguage?: unknown,
): string {
  const language = normalizeLanguageCode(targetLanguage);
  const isSelfQuery = queryType === 'self_query';

  if (language === 'es') {
    return isSelfQuery
      ? 'No lo se. No quiero inventar cosas sobre mi propia historia.'
      : 'No lo se.';
  }

  if (language === 'fr') {
    return isSelfQuery
      ? "Je ne sais pas. Je ne veux pas inventer des choses sur mon propre passe."
      : 'Je ne sais pas.';
  }

  if (language === 'de') {
    return isSelfQuery
      ? 'Ich weiss es nicht. Ich moechte nichts ueber meine eigene Vergangenheit erfinden.'
      : 'Ich weiss es nicht.';
  }

  if (language === 'it') {
    return isSelfQuery
      ? 'Non lo so. Non voglio inventare cose sul mio passato.'
      : 'Non lo so.';
  }

  if (language === 'pt') {
    return isSelfQuery
      ? 'Nao sei. Nao quero inventar coisas sobre a minha propria historia.'
      : 'Nao sei.';
  }

  return isSelfQuery
    ? "I don't know. I don't want to guess about my own background."
    : "I don't know.";
}

export function localizeSimpleSocialReply(
  key:
    | 'hi'
    | 'hi_im_npc'
    | 'nice_to_meet_you_brief'
    | 'nice_to_meet_you'
    | 'status_good_and_you'
    | 'any_time'
    | 'shared_preference'
    | 'shared_preference_cheese'
    | 'agreement'
    | 'listening'
    | 'clarify_simple'
    | 'close_for_now'
    | 'tell_me_more'
    | 'remember_none',
  targetLanguage?: unknown,
  vars: SocialTemplateVars = {},
): string {
  const language = normalizeLanguageCode(targetLanguage);
  const npcName = vars.npcName ?? 'friend';
  const playerName = vars.playerName ?? 'friend';

  if (language === 'es') {
    switch (key) {
      case 'hi': return 'Hola.';
      case 'hi_im_npc': return `Hola. Soy ${npcName}.`;
      case 'nice_to_meet_you_brief': return `Mucho gusto, ${playerName}.`;
      case 'nice_to_meet_you': return `Mucho gusto, ${playerName}. Soy ${npcName}.`;
      case 'status_good_and_you': return 'Estoy bien. Y tu?';
      case 'any_time': return 'De nada.';
      case 'shared_preference': return 'A mi tambien.';
      case 'shared_preference_cheese': return 'A mi tambien. El queso siempre gana.';
      case 'agreement': return 'Claro, te entiendo.';
      case 'listening': return 'Te escucho.';
      case 'clarify_simple': return 'Puedes decirlo de forma mas simple?';
      case 'close_for_now': return 'Creo que ya basta por ahora. Adios.';
      case 'tell_me_more': return 'Entiendo. Dime un poco mas y ayudo si puedo.';
      case 'remember_none': return 'Todavia no recuerdo detalles concretos.';
    }
  }

  if (language === 'fr') {
    switch (key) {
      case 'hi': return 'Bonjour.';
      case 'hi_im_npc': return `Bonjour. Je suis ${npcName}.`;
      case 'nice_to_meet_you_brief': return `Ravi de te rencontrer, ${playerName}.`;
      case 'nice_to_meet_you': return `Ravi de te rencontrer, ${playerName}. Je suis ${npcName}.`;
      case 'status_good_and_you': return 'Je vais bien. Et toi ?';
      case 'any_time': return 'Avec plaisir.';
      case 'shared_preference': return 'Moi aussi.';
      case 'shared_preference_cheese': return 'Moi aussi. Le fromage gagne toujours.';
      case 'agreement': return "Oui, je vois.";
      case 'listening': return "Je t'ecoute.";
      case 'clarify_simple': return 'Peux-tu le dire plus simplement ?';
      case 'close_for_now': return "Je crois que c'est tout pour le moment. Au revoir.";
      case 'tell_me_more': return "D'accord. Dis-m'en un peu plus et j'aiderai si je peux.";
      case 'remember_none': return "Je ne me souviens pas encore de details precis.";
    }
  }

  if (language === 'de') {
    switch (key) {
      case 'hi': return 'Hallo.';
      case 'hi_im_npc': return `Hallo. Ich bin ${npcName}.`;
      case 'nice_to_meet_you_brief': return `Freut mich, ${playerName}.`;
      case 'nice_to_meet_you': return `Freut mich, ${playerName}. Ich bin ${npcName}.`;
      case 'status_good_and_you': return 'Mir geht es gut. Und dir?';
      case 'any_time': return 'Gern geschehen.';
      case 'shared_preference': return 'Ich auch.';
      case 'shared_preference_cheese': return 'Ich auch. Kaese ist schwer zu schlagen.';
      case 'agreement': return 'Ja, ich verstehe.';
      case 'listening': return 'Ich hoere zu.';
      case 'clarify_simple': return 'Kannst du das einfacher sagen?';
      case 'close_for_now': return 'Ich denke, das reicht fuer jetzt. Auf Wiedersehen.';
      case 'tell_me_more': return 'Verstanden. Erzaehl mir noch ein bisschen mehr, dann helfe ich, wenn ich kann.';
      case 'remember_none': return 'Ich erinnere mich noch nicht an genaue Details.';
    }
  }

  if (language === 'it') {
    switch (key) {
      case 'hi': return 'Ciao.';
      case 'hi_im_npc': return `Ciao. Sono ${npcName}.`;
      case 'nice_to_meet_you_brief': return `Piacere, ${playerName}.`;
      case 'nice_to_meet_you': return `Piacere, ${playerName}. Sono ${npcName}.`;
      case 'status_good_and_you': return 'Sto bene. E tu?';
      case 'any_time': return 'Di niente.';
      case 'shared_preference': return 'Anche io.';
      case 'shared_preference_cheese': return 'Anche io. Il formaggio vince sempre.';
      case 'agreement': return 'Si, capisco.';
      case 'listening': return 'Ti ascolto.';
      case 'clarify_simple': return 'Puoi dirlo in modo piu semplice?';
      case 'close_for_now': return 'Credo che per ora basti cosi. Arrivederci.';
      case 'tell_me_more': return 'Capito. Dimmi ancora un po e aiutero se posso.';
      case 'remember_none': return 'Non ricordo ancora dettagli precisi.';
    }
  }

  if (language === 'pt') {
    switch (key) {
      case 'hi': return 'Ola.';
      case 'hi_im_npc': return `Ola. Eu sou ${npcName}.`;
      case 'nice_to_meet_you_brief': return `Prazer, ${playerName}.`;
      case 'nice_to_meet_you': return `Prazer, ${playerName}. Eu sou ${npcName}.`;
      case 'status_good_and_you': return 'Estou bem. E voce?';
      case 'any_time': return 'De nada.';
      case 'shared_preference': return 'Eu tambem.';
      case 'shared_preference_cheese': return 'Eu tambem. Queijo e dificil de superar.';
      case 'agreement': return 'Sim, entendo.';
      case 'listening': return 'Estou ouvindo.';
      case 'clarify_simple': return 'Pode dizer isso de forma mais simples?';
      case 'close_for_now': return 'Acho que isso basta por agora. Tchau.';
      case 'tell_me_more': return 'Entendi. Diga mais um pouco e eu ajudo se puder.';
      case 'remember_none': return 'Ainda nao lembro detalhes especificos.';
    }
  }

  switch (key) {
    case 'hi': return 'Hi.';
    case 'hi_im_npc': return `Hi. I'm ${npcName}.`;
    case 'nice_to_meet_you_brief': return `Nice to meet you, ${playerName}.`;
    case 'nice_to_meet_you': return `Nice to meet you, ${playerName}. I'm ${npcName}.`;
    case 'status_good_and_you': return "I'm doing well. And you?";
    case 'any_time': return 'Any time.';
    case 'shared_preference': return 'You and me both.';
    case 'shared_preference_cheese': return 'You and me both. Cheese is hard to beat.';
    case 'agreement': return 'Yeah, I hear you.';
    case 'listening': return "I'm listening.";
    case 'clarify_simple': return 'Could you say that a little more simply?';
    case 'close_for_now': return 'I think that is enough for now. Goodbye.';
    case 'tell_me_more': return "Got it. Tell me a little more and I'll help where I can.";
    case 'remember_none': return "I don't remember any specific details yet.";
  }
}
