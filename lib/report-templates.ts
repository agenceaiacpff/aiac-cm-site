export type ReportType=
  |"task_execution"|"activity"|"weekly_antenna"|"weekly_meeting"|"monthly_staff"
  |"project"|"program"|"training"|"mission"|"monitoring_evaluation"|"other";

export const reportTypes:Record<ReportType,string>={
  task_execution:"Rapport d’exécution de tâche",
  activity:"Rapport d’activité",
  weekly_antenna:"Rapport hebdomadaire d’antenne",
  weekly_meeting:"Rapport de réunion hebdomadaire",
  monthly_staff:"Rapport mensuel d’agent",
  project:"Rapport de projet",
  program:"Rapport de programme",
  training:"Rapport de formation",
  mission:"Rapport de mission",
  monitoring_evaluation:"Rapport de suivi-évaluation",
  other:"Autre rapport institutionnel"
};

const common=[
  "Contexte et justification","Introduction","Objectifs","Public cible et bénéficiaires",
  "Préparation et méthodologie","Déroulement détaillé","Résultats et produits obtenus",
  "Indicateurs et moyens de vérification","Observations et constats","Apprentissages et bonnes pratiques",
  "Difficultés, risques et mesures correctives","Défis et points à améliorer","Recommandations",
  "Prochaines étapes et responsabilités","Histoire de réussite","Sauvegarde, PSEAH et inclusion",
  "Conclusion","Annexes et références"
];

const sections:Record<ReportType,string[]>={
  task_execution:common,
  activity:common,
  weekly_antenna:["Contexte et justification","Objectifs de la semaine","Résumé exécutif","Déroulement de la semaine","Activités réalisées par jour","Séminaires, colloques et événements","Partenariats et mobilisation","Formations et instituts","Journées internationales","Suivi des recommandations","Situation des ressources humaines","Résultats obtenus","Difficultés et défis","Points à améliorer","Recommandations","Histoire de réussite","Planification de la semaine suivante","Mot du responsable d’antenne","Divers","Conclusion","Annexes et photographies"],
  weekly_meeting:["Contexte et justification","Objectifs de la réunion","Accueil et vérification des présences","Lecture et adoption du précédent procès-verbal","Rapports des antennes","Rapports des points focaux","Rapport des ressources humaines","Planification hebdomadaire","Répartition des responsabilités","Informations générales","Difficultés et défis","Points à améliorer","Recommandations","Histoires de réussite","Mot de la coordination / direction technique","Mot de la Présidence du Conseil d’administration","Divers","Décisions et échéances","Conclusion","Annexes et liste de présence"],
  monthly_staff:["Résumé exécutif","Objectifs du mois","Plan opérationnel et chronogramme","Activités réalisées","Résultats attendus et résultats obtenus","Moyens de vérification","Indicateurs","Collaborations et personnes contactées","Difficultés et mesures correctives","Apprentissages","Priorités du mois suivant","Recommandations","Conclusion","Annexes"],
  project:["Page de garde et identification","Résumé exécutif","Contexte et justification","Présentation du projet","Objectif général et objectifs spécifiques","Zone d’intervention et groupes cibles","Gouvernance et parties prenantes","Approche méthodologique","État d’exécution des activités","Cadre de résultats et indicateurs","Résultats, effets et impact","Participation et inclusion","Suivi-évaluation et moyens de vérification","Exécution budgétaire","Risques, difficultés et mesures correctives","Apprentissages et bonnes pratiques","Communication et visibilité","Durabilité et stratégie de sortie","Recommandations et plan d’action","Conclusion","Annexes techniques, financières et photographiques"],
  program:["Résumé exécutif","Contexte institutionnel","Présentation du programme","Portefeuille des projets","Objectifs et théorie du changement","Gouvernance et partenariats","Avancement consolidé des activités","Résultats et indicateurs consolidés","Bénéficiaires et couverture géographique","Suivi-évaluation, redevabilité et apprentissage","Exécution budgétaire consolidée","Risques et mesures correctives","Impact, histoires de changement et bonnes pratiques","Durabilité","Recommandations stratégiques","Plan de la période suivante","Conclusion","Annexes"],
  training:["Contexte et justification","Objectifs pédagogiques","Profil des participants","Préparation et supports","Méthodologie pédagogique","Déroulement des modules","Évaluation des acquis","Résultats et compétences acquises","Difficultés","Leçons apprises","Recommandations et suivi post-formation","Conclusion","Annexes, présences et photographies"],
  mission:["Contexte et termes de référence","Objectifs de la mission","Équipe et itinéraire","Méthodologie","Déroulement journalier","Personnes et structures rencontrées","Constats","Résultats","Difficultés et risques","Recommandations","Plan de suivi","Conclusion","Annexes et justificatifs"],
  monitoring_evaluation:["Contexte et périmètre","Objectifs et questions évaluatives","Méthodologie et échantillonnage","Cadre d’indicateurs","Données collectées","Analyse des résultats","Écarts par rapport aux cibles","Qualité et limites des données","Constats de sauvegarde et inclusion","Apprentissages","Recommandations prioritaires","Plan d’amélioration","Conclusion","Annexes et outils de collecte"],
  other:common
};

export function reportTemplateHtml(type:ReportType){
  return sections[type].map(title=>`<h2>${title}</h2><p><br></p>`).join("");
}

export function defaultReportTitle(type:ReportType){return reportTypes[type];}

export function pruneEmptyReportSections(html:string){
  if(typeof window==="undefined")return html;
  const doc=new DOMParser().parseFromString(`<div id="report-root">${html}</div>`,"text/html");
  const root=doc.getElementById("report-root");if(!root)return html;
  const headings=Array.from(root.querySelectorAll("h1,h2,h3,h4"));
  for(const heading of headings){
    const following:Element[]=[];let node=heading.nextElementSibling;
    while(node&&!/^H[1-4]$/.test(node.tagName)){following.push(node);node=node.nextElementSibling;}
    const meaningful=following.some(element=>{
      const text=(element.textContent||"").replace(/\u00a0/g," ").trim();
      return Boolean(text||element.querySelector("img,table,video,audio,iframe"));
    });
    if(!meaningful){heading.remove();following.forEach(element=>element.remove());}
  }
  return root.innerHTML;
}
