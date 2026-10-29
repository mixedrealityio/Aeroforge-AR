import type {ScenarioId} from '../firebase/payloadValidation';

export type DimeoLanguage = 'en' | 'fr' | 'es';
export type DimeoSuitePillar = 'player' | 'recorder' | 'editor';
export type DimeoMarkerType =
  | 'arrow'
  | 'circle_ring'
  | 'poi_pin'
  | 'warning_cone';
export type DimeoQcmOutcome =
  | 'nominal'
  | 'corrective_rework'
  | 'escalate_supervision';
export type DimeoCommentCategory = 'anomaly' | 'kaizen' | 'note';
export type DimeoAccountMode = 'nominative' | 'shared_station';
export type DimeoDigitalTwinScale = '1:1' | '0.5x' | '0.35x_tabletop';

export type DimeoVoiceAction =
  | 'next_step'
  | 'prev_step'
  | 'validate_step'
  | 'capture_photo'
  | 'toggle_follow_head'
  | 'read_aloud'
  | 'toggle_ar'
  | 'place_arrow'
  | 'place_circle'
  | 'place_poi';

export interface DimeoSpatialMarker {
  readonly id: string;
  readonly stepNumber: number;
  readonly type: DimeoMarkerType;
  readonly label: string;
  /** World-space [x, y, z] in meters inside the XR workcell */
  readonly worldPosition: readonly [number, number, number];
  /** Unit or directional offset vector for 3D arrows [dx, dy, dz] */
  readonly direction: readonly [number, number, number];
  readonly colorHex: string;
  readonly customAuthoring: boolean;
}

export interface DimeoQcmOption {
  readonly id: DimeoQcmOutcome;
  readonly label: string;
  readonly adaptiveGuidance: string;
  readonly badgeText: string;
}

export interface DimeoStepQcmSpec {
  readonly question: string;
  readonly options: readonly DimeoQcmOption[];
}

export interface DimeoPhotoEvidence {
  readonly id: string;
  readonly stepNumber: number;
  readonly dataUrl: string;
  readonly caption: string;
  readonly capturedAtIso: string;
  readonly operatorLabel: string;
}

export interface DimeoOperatorComment {
  readonly id: string;
  readonly stepNumber: number;
  readonly category: DimeoCommentCategory;
  readonly message: string;
  readonly authorBadge: string;
  readonly createdAtIso: string;
}

export interface DimeoGestureVideoClip {
  readonly id: string;
  readonly stepNumber: number;
  readonly durationSec: number;
  readonly downloadUrl: string;
  readonly mimeType: string;
  readonly recordedAtIso: string;
}

export interface DimeoAuthoredStep {
  readonly stepNumber: number;
  readonly title: string;
  readonly instruction: string;
  readonly warningText: string;
  readonly extractedTorqueNm: number;
  readonly extractedToleranceLabel: string;
  readonly markerType: DimeoMarkerType;
  readonly worldPosition: readonly [number, number, number];
  readonly snapshotDataUrl: string;
  readonly qcm: DimeoStepQcmSpec;
}

export interface DimeoLocalizedUiStrings {
  readonly suiteBadge: string;
  readonly arOnLabel: string;
  readonly arOffClassicLabel: string;
  readonly followHeadLabel: string;
  readonly worldPinnedLabel: string;
  readonly readAloudLabel: string;
  readonly snapPhotoLabel: string;
  readonly prevLabel: string;
  readonly nextLabel: string;
  readonly mountLabel: string;
  readonly validateStepLabel: string;
  readonly qcmPromptPrefix: string;
  readonly voiceReadyHint: string;
}

export const SHARED_STATION_BADGES: ReadonlyArray<{
  readonly badge: string;
  readonly label: string;
}> = Object.freeze([
  {badge: 'POSTE-A1-MATIN', label: 'POSTE-A1 · Shift Alpha (Assembly)'},
  {badge: 'POSTE-A2-APREM', label: 'POSTE-A2 · Shift Bravo (Finishing)'},
  {badge: 'POSTE-MRO-04', label: 'POSTE-MRO-04 · Line Maintenance'},
]);

const UI_STRINGS: Readonly<Record<DimeoLanguage, DimeoLocalizedUiStrings>> =
  Object.freeze({
    en: {
      suiteBadge: 'DIMEO ANDROID XR',
      arOnLabel: 'AR Guides: ON',
      arOffClassicLabel: 'Classic 2D',
      followHeadLabel: 'Follow-Me',
      worldPinnedLabel: 'Pinned',
      readAloudLabel: 'Read',
      snapPhotoLabel: 'Photo',
      prevLabel: 'Prev',
      nextLabel: 'Next',
      mountLabel: 'Mount',
      validateStepLabel: 'Confirm Step',
      qcmPromptPrefix: 'QCM Check',
      voiceReadyHint:
        'Voice commands: "Next", "Previous", "Validate", "Photo", "Follow", "Read"',
    },
    fr: {
      suiteBadge: 'DIMEO ANDROID XR',
      arOnLabel: 'Repères RA: ON',
      arOffClassicLabel: 'Mode Classique',
      followHeadLabel: 'Suivi Tête',
      worldPinnedLabel: 'Épinglé',
      readAloudLabel: 'Lire',
      snapPhotoLabel: 'Photo',
      prevLabel: 'Préc.',
      nextLabel: 'Suiv.',
      mountLabel: 'Monter',
      validateStepLabel: 'Valider Étape',
      qcmPromptPrefix: 'Scénario QCM',
      voiceReadyHint:
        'Commandes vocales : « Suivant », « Précédent », « Valider », « Photo », « Suivre », « Lire »',
    },
    es: {
      suiteBadge: 'DIMEO ANDROID XR',
      arOnLabel: 'Guías RA: ON',
      arOffClassicLabel: 'Modo Clásico',
      followHeadLabel: 'Seguir Vista',
      worldPinnedLabel: 'Anclado',
      readAloudLabel: 'Leer',
      snapPhotoLabel: 'Foto',
      prevLabel: 'Ant.',
      nextLabel: 'Sig.',
      mountLabel: 'Montar',
      validateStepLabel: 'Validar Paso',
      qcmPromptPrefix: 'Escenario QCM',
      voiceReadyHint:
        'Comandos de voz: « Siguiente », « Anterior », « Validar », « Foto », « Seguir », « Leer »',
    },
  });

interface LocalizedStepContent {
  readonly title: string;
  readonly instruction: string;
  readonly warningText: string;
  readonly qcm: DimeoStepQcmSpec;
}

const LOCALIZED_SCENARIO_STEPS: Readonly<
  Record<
    ScenarioId,
    Readonly<Record<DimeoLanguage, Readonly<Record<number, LocalizedStepContent>>>>
  >
> = Object.freeze({
  panel_buildup: {
    en: {
      1: {
        title: 'Bonding Pins — 40 mm Set (8x Spots)',
        instruction:
          'Degrease the 8 fuselage spots highlighted by AR circles. Apply acrylic structural adhesive and press each 40.0 mm ABS2277VV40B pin normal to the skin.',
        warningText:
          'WARNING: Verify 40.0 mm pin length! Do NOT confuse with 30.0 mm ABS2277VV30B.',
        qcm: {
          question: 'Pre-bonding skin & pin length check (ABS2277VV40B):',
          options: [
            {
              id: 'nominal',
              label: '40.0 mm verified & solvent-wiped',
              adaptiveGuidance:
                'QCM OK: Proceed with adhesive cure timer and laser height scan.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: '30 mm pin or surface residue found',
              adaptiveGuidance:
                'BRANCH REWORK: Quarantine 30 mm lot, re-wipe skin with MEK-free solvent, and re-stage 40.0 mm pins.',
              badgeText: 'BRANCH: RE-STAGE 40MM',
            },
            {
              id: 'escalate_supervision',
              label: 'Primer delamination on fuselage bay',
              adaptiveGuidance:
                'SUPERVISION HOLD: Capture AR photo evidence and log an Anomaly comment before proceeding.',
              badgeText: 'HOLD: PHOTO + NCR',
            },
          ],
        },
      },
      2: {
        title: 'Click-Stud Retention Brackets (Stringer S-14)',
        instruction:
          'Snap 6 ABS1423FA02 click-stud standoffs onto stringer S-14 & S-15 flanges following the 3D directional arrows and torque to 8.5 N·m.',
        warningText:
          'WARNING: Orient locking tab UPWARD (+Y) toward Frame FR-14 web.',
        qcm: {
          question: 'Click-stud locking tab orientation on Stringer S-14:',
          options: [
            {
              id: 'nominal',
              label: 'All 6 tabs oriented UPWARD (+Y)',
              adaptiveGuidance:
                'QCM OK: Apply 8.5 N·m quarter-turn seating torque.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Inverted bracket (-Y) detected',
              adaptiveGuidance:
                'BRANCH REWORK: Release quarter-turn collar, rotate bracket 180° (+Y), and re-torque to 8.5 N·m.',
              badgeText: 'BRANCH: ROTATE +Y',
            },
            {
              id: 'escalate_supervision',
              label: 'Stringer flange burr / deform',
              adaptiveGuidance:
                'SUPERVISION HOLD: Snap close-up 3D photo and notify Structures Lead.',
              badgeText: 'HOLD: STRUCTURES',
            },
          ],
        },
      },
      3: {
        title: 'Primary Thermal-Acoustic Insulation Blanket',
        instruction:
          'Align blanket G537700011 between frames FR-14 and FR-16 with gold Kapton film facing inward (+Z) and impale over all 8 pins.',
        warningText:
          'WARNING: Gold metallized vapor barrier MUST face cabin interior (+Z).',
        qcm: {
          question: 'Kapton vapor barrier face & seam overlap inspection:',
          options: [
            {
              id: 'nominal',
              label: 'Gold film inward (+Z), overlap >= 15 mm',
              adaptiveGuidance:
                'QCM OK: Proceed to ultrasonic vapor-seam attenuation check.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Vapor tape wrinkle / < 15 mm lap',
              adaptiveGuidance:
                'BRANCH REWORK: Roller-burnish metallized Polyimide seam tape across Frame FR-15.',
              badgeText: 'BRANCH: BURNISH SEAM',
            },
            {
              id: 'escalate_supervision',
              label: 'Punctured Kapton acoustic quilt',
              adaptiveGuidance:
                'SUPERVISION HOLD: Photograph tear location and apply approved repair patch.',
              badgeText: 'HOLD: PATCH REQ',
            },
          ],
        },
      },
      4: {
        title: 'Avionics & ECS Harness P-Clamp Rail',
        instruction:
          'Route braided harness across click-stud brackets and close EPDM P-clamps ABS2259A07 at 4.5 N·m while maintaining >= 6.5 mm blanket clearance.',
        warningText:
          'WARNING: Maintain >= 6.5 mm standoff from insulation film to prevent vibration chafing.',
        qcm: {
          question: 'Clamp Station C optical clearance to acoustic blanket:',
          options: [
            {
              id: 'nominal',
              label: 'Clearance within 6.5 – 9.5 mm band',
              adaptiveGuidance:
                'QCM OK: Torque P-clamp fastener to 4.5 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Chafe risk (< 6.5 mm gap at Station C)',
              adaptiveGuidance:
                'BRANCH REWORK: Insert 3.8 mm NAS1149 anodized standoff shim under Clamp C before torquing.',
              badgeText: 'BRANCH: ADD 3.8MM SHIM',
            },
            {
              id: 'escalate_supervision',
              label: 'Harness braid abrasion observed',
              adaptiveGuidance:
                'SUPERVISION HOLD: Record AR photo + Avionics NCR comment.',
              badgeText: 'HOLD: AVIONICS NCR',
            },
          ],
        },
      },
      5: {
        title: 'Self-Locking Pin Washers & Frame Shear Ties',
        instruction:
          'Seat self-locking dome caps flush onto all 8 pins and torque upper/lower shear-tie bolts in star sequence to 18.5 N·m.',
        warningText:
          'WARNING: Seat all 8 dome caps flush before torquing shear-tie fasteners in cross order.',
        qcm: {
          question: 'Shear-tie cross-sequence preload verification:',
          options: [
            {
              id: 'nominal',
              label: 'All 8 caps flush & 18.5 N·m star torque',
              adaptiveGuidance:
                'QCM OK: Ready for final dado panel closure.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Under-torque (< 17.5 N·m) on Tie #2',
              adaptiveGuidance:
                'BRANCH REWORK: Re-zero digital angle wrench and execute 2-pass star re-torque to 18.5 N·m.',
              badgeText: 'BRANCH: STAR RE-TORQUE',
            },
            {
              id: 'escalate_supervision',
              label: 'Stripped locking cap serration',
              adaptiveGuidance:
                'SUPERVISION HOLD: Replace dome cap lot and log traceability note.',
              badgeText: 'HOLD: CAP LOT',
            },
          ],
        },
      },
      6: {
        title: 'Carbon-Nomex Cabin Dado Lining Panel',
        instruction:
          'Close port and starboard Carbon-Nomex dado panel leaves over the bay, align decompression louver, and torque latches to 6.2 N·m.',
        warningText:
          'WARNING: Verify decompression vent louver alignment before engaging quarter-turn latches.',
        qcm: {
          question: 'Decompression louver & flush frame step check:',
          options: [
            {
              id: 'nominal',
              label: 'Louver clear & frame step <= 0.5 mm',
              adaptiveGuidance:
                'QCM OK: Complete ultrasonic bond scan and sign off release.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Edge mismatch > 0.5 mm at latch',
              adaptiveGuidance:
                'BRANCH REWORK: Adjust eccentric quarter-turn receptacle and re-torque to 6.2 N·m.',
              badgeText: 'BRANCH: TRIM LATCH',
            },
            {
              id: 'escalate_supervision',
              label: 'Honeycomb core disbond echo > 1.5 dB',
              adaptiveGuidance:
                'SUPERVISION HOLD: Flag NDT disbond with AR photo for resin injection.',
              badgeText: 'HOLD: NDT DISBOND',
            },
          ],
        },
      },
    },
    fr: {
      1: {
        title: 'Aiguilles de Collage — Lot 40 mm (8 Points)',
        instruction:
          'Dégraisser les 8 zones fuselage indiquées par les cercles RA. Appliquer la colle structurale et presser chaque aiguille ABS2277VV40B (40,0 mm) perpendiculairement à la peau.',
        warningText:
          'ATTENTION : Vérifier la longueur 40,0 mm ! Ne PAS confondre avec la référence courte ABS2277VV30B (30,0 mm).',
        qcm: {
          question: 'Contrôle QCM avant collage (longueur aiguille & peau) :',
          options: [
            {
              id: 'nominal',
              label: 'Longueur 40,0 mm conforme & dégraissage OK',
              adaptiveGuidance:
                'QCM CONFORME : Poursuivre la polymérisation et le contrôle laser 40 mm.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Aiguille 30 mm ou trace grasse détectée',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Écarter le lot 30 mm, nettoyer au solvant agréé et reposer les aiguilles 40,0 mm.',
              badgeText: 'BRANCHE : REPOSE 40MM',
            },
            {
              id: 'escalate_supervision',
              label: 'Décollement primaire anticorrosion',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Prendre une photo RA et consigner un commentaire Anomalie.',
              badgeText: 'ARRÊT : PHOTO + FNC',
            },
          ],
        },
      },
      2: {
        title: 'Supports Quart-de-Tour (Lisse S-14)',
        instruction:
          'Clipser les 6 supports ABS1423FA02 sur les semelles des lisses S-14 et S-15 selon les flèches 3D, puis serrer à 8,5 N·m.',
        warningText:
          'ATTENTION : Orienter la languette de verrouillage VERS LE HAUT (+Y) côté cadre FR-14.',
        qcm: {
          question: 'Orientation des languettes sur la lisse S-14 :',
          options: [
            {
              id: 'nominal',
              label: '6 languettes orientées vers le haut (+Y)',
              adaptiveGuidance:
                'QCM CONFORME : Valider le serrage au couple de 8,5 N·m.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Support inversé (-Y) détecté',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Déverrouiller l’embase, pivoter à 180° (+Y) et resserrer à 8,5 N·m.',
              badgeText: 'BRANCHE : PIVOTER +Y',
            },
            {
              id: 'escalate_supervision',
              label: 'Bavure ou déformation sur semelle',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Capturer une photo 3D et prévenir le référent Structure.',
              badgeText: 'ARRÊT : STRUCTURE',
            },
          ],
        },
      },
      3: {
        title: 'Matelas Thermo-Acoustique Primaire',
        instruction:
          'Positionner le matelas G537700011 entre les cadres FR-14 et FR-16, film Kapton doré vers la cabine (+Z), et embrocher les 8 aiguilles.',
        warningText:
          'ATTENTION : Le pare-vapeur doré DOIT faire face à l’intérieur cabine (+Z).',
        qcm: {
          question: 'Vérification du film pare-vapeur Kapton et recouvrement :',
          options: [
            {
              id: 'nominal',
              label: 'Film doré côté cabine (+Z), recouvrement >= 15 mm',
              adaptiveGuidance:
                'QCM CONFORME : Passer au contrôle ultrasonore du joint pare-vapeur.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Pli du ruban ou recouvrement < 15 mm',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Maroufler au rouleau le ruban polyimide sur le cadre FR-15.',
              badgeText: 'BRANCHE : MAROUFLAGE',
            },
            {
              id: 'escalate_supervision',
              label: 'Accroc / perforation du matelas',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Photographier la déchirure et poser un patch Kapton homologué.',
              badgeText: 'ARRÊT : PATCH RA',
            },
          ],
        },
      },
      4: {
        title: 'Rail de Colliers P Harnais Avionique & ECS',
        instruction:
          'Cheminer le harnais tressé sur les supports et fermer les colliers EPDM ABS2259A07 à 4,5 N·m en gardant >= 6,5 mm de jeu.',
        warningText:
          'ATTENTION : Maintenir >= 6,5 mm de garde au matelas pour éviter tout frottement vibratoire.',
        qcm: {
          question: 'Mesure optique de garde au poste Collier C :',
          options: [
            {
              id: 'nominal',
              label: 'Jeu compris entre 6,5 et 9,5 mm',
              adaptiveGuidance:
                'QCM CONFORME : Serrer la vis du collier P à 4,5 N·m.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Risque frottement (jeu < 6,5 mm au Collier C)',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Insérer une cale anodisée NAS1149 de 3,8 mm sous le Collier C.',
              badgeText: 'BRANCHE : CALE 3,8MM',
            },
            {
              id: 'escalate_supervision',
              label: 'Usure de tresse harnais observée',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Joindre photo RA + commentaire Anomalie Avionique.',
              badgeText: 'ARRÊT : FNC AVIONIQUE',
            },
          ],
        },
      },
      5: {
        title: 'Rondelles Auto-Freinées & Éclisses de Cadre',
        instruction:
          'Engager les capuchons auto-freinés à fleur sur les 8 aiguilles puis serrer en croix les boulons d’éclisse FR-15 à 18,5 N·m.',
        warningText:
          'ATTENTION : Coiffer les 8 aiguilles avant le serrage croisé des éclisses.',
        qcm: {
          question: 'Contrôle précharge en étoile des éclisses FR-15 :',
          options: [
            {
              id: 'nominal',
              label: '8 capuchons à fleur & couple 18,5 N·m OK',
              adaptiveGuidance:
                'QCM CONFORME : Prêt pour la fermeture du panneau Dado.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Sous-couple (< 17,5 N·m) sur fixation #2',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Ré-étalonner la clé numérique et reprendre la passe en étoile à 18,5 N·m.',
              badgeText: 'BRANCHE : REPRISE COUPLE',
            },
            {
              id: 'escalate_supervision',
              label: 'Rondelle auto-freinée endommagée',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Remplacer la rondelle et tracer le lot dans Dimeo.',
              badgeText: 'ARRÊT : LOT RONDELLE',
            },
          ],
        },
      },
      6: {
        title: 'Panneau Habillage Dado Carbone-Nomex',
        instruction:
          'Fermer les vantaux bâbord et tribord du panneau Dado Carbone-Nomex, aligner la grille de décompression et serrer à 6,2 N·m.',
        warningText:
          'ATTENTION : Vérifier l’alignement des ouïes de décompression avant verrouillage.',
        qcm: {
          question: 'Contrôle affleurement panneau Dado & grille décompression :',
          options: [
            {
              id: 'nominal',
              label: 'Grille dégagée & désaffleurement <= 0,5 mm',
              adaptiveGuidance:
                'QCM CONFORME : Exécuter le scan ultrasonore final et signer la libération.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Désaffleurement > 0,5 mm au verrou',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Régler le réceptacle excentrique et resserrer à 6,2 N·m.',
              badgeText: 'BRANCHE : RÉGLAGE VERROU',
            },
            {
              id: 'escalate_supervision',
              label: 'Écho délaminage Nomex > 1,5 dB',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Capturer photo RA pour injection résine CND.',
              badgeText: 'ARRÊT : CND NOMEX',
            },
          ],
        },
      },
    },
    es: {
      1: {
        title: 'Pines de Adhesión — Juego 40 mm (8 Puntos)',
        instruction:
          'Desengrasar los 8 puntos del fuselaje marcados con círculos RA. Aplicar adhesivo estructural y presionar cada pin ABS2277VV40B de 40,0 mm perpendicular al revestimiento.',
        warningText:
          'ADVERTENCIA: ¡Verificar longitud de 40,0 mm! NO confundir con ABS2277VV30B (30,0 mm).',
        qcm: {
          question: 'Verificación QCM previa al pegado (longitud y limpieza):',
          options: [
            {
              id: 'nominal',
              label: '40,0 mm verificado y superficie limpia',
              adaptiveGuidance:
                'QCM OK: Continuar con curado y medición láser de 40 mm.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Pin de 30 mm o residuo detectado',
              adaptiveGuidance:
                'RETRABAJO: Retirar lote de 30 mm, limpiar con solvente aprobado y colocar pines de 40,0 mm.',
              badgeText: 'RAMA: REPONER 40MM',
            },
            {
              id: 'escalate_supervision',
              label: 'Desprendimiento de imprimación',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Tomar foto RA y registrar comentario de Anomalía.',
              badgeText: 'PARADA: FOTO + NCR',
            },
          ],
        },
      },
      2: {
        title: 'Soportes de Retención Cuarto de Vuelta (S-14)',
        instruction:
          'Encajar los 6 soportes ABS1423FA02 en los larguerillos S-14 y S-15 siguiendo las flechas 3D y apretar a 8,5 N·m.',
        warningText:
          'ADVERTENCIA: Orientar la pestaña de bloqueo HACIA ARRIBA (+Y) hacia FR-14.',
        qcm: {
          question: 'Orientación de pestañas en larguerillo S-14:',
          options: [
            {
              id: 'nominal',
              label: '6 pestañas orientadas hacia arriba (+Y)',
              adaptiveGuidance:
                'QCM OK: Aplicar par de apriete de 8,5 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Soporte invertido (-Y) detectado',
              adaptiveGuidance:
                'RETRABAJO: Liberar collarín, girar 180° (+Y) y reapretar a 8,5 N·m.',
              badgeText: 'RAMA: GIRAR +Y',
            },
            {
              id: 'escalate_supervision',
              label: 'Rebaba o daño en pestaña estructural',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Capturar foto 3D y avisar a Ingeniería Estructural.',
              badgeText: 'PARADA: ESTRUCTURAS',
            },
          ],
        },
      },
      3: {
        title: 'Manta Termoacústica Primaria Kapton',
        instruction:
          'Alinear la manta G537700011 entre cuadernas FR-14 y FR-16 con película dorada hacia cabina (+Z) e insertar en los 8 pines.',
        warningText:
          'ADVERTENCIA: La barrera de vapor dorada DEBE mirar hacia cabina (+Z).',
        qcm: {
          question: 'Inspección de cara Kapton y solape de junta:',
          options: [
            {
              id: 'nominal',
              label: 'Cara dorada (+Z) y solape >= 15 mm',
              adaptiveGuidance:
                'QCM OK: Proceder al escaneo ultrasónico de atenuación.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Arruga en cinta o solape < 15 mm',
              adaptiveGuidance:
                'RETRABAJO: Bruñir con rodillo la cinta de poliimida sobre FR-15.',
              badgeText: 'RAMA: BRUÑIR JUNTA',
            },
            {
              id: 'escalate_supervision',
              label: 'Perforación en manta acústica',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Fotografiar rotura y aplicar parche homologado.',
              badgeText: 'PARADA: PARCHE',
            },
          ],
        },
      },
      4: {
        title: 'Riel de Abrazaderas P de Arnés Aviónica',
        instruction:
          'Tender el arnés trenzado sobre los soportes y cerrar abrazaderas EPDM ABS2259A07 a 4,5 N·m manteniendo >= 6,5 mm de holgura.',
        warningText:
          'ADVERTENCIA: Mantener >= 6,5 mm de separación para evitar roce por vibración.',
        qcm: {
          question: 'Holgura óptica en estación de Abrazadera C:',
          options: [
            {
              id: 'nominal',
              label: 'Holgura entre 6,5 y 9,5 mm',
              adaptiveGuidance:
                'QCM OK: Apretar tornillo de abrazadera P a 4,5 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Riesgo de roce (< 6,5 mm en Estación C)',
              adaptiveGuidance:
                'RETRABAJO: Insertar suplemento anodizado NAS1149 de 3,8 mm bajo Abrazadera C.',
              badgeText: 'RAMA: SUPLEMENTO 3,8MM',
            },
            {
              id: 'escalate_supervision',
              label: 'Abrasión en malla del arnés',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Adjuntar foto RA y nota NCR de Aviónica.',
              badgeText: 'PARADA: NCR AVIÓNICA',
            },
          ],
        },
      },
      5: {
        title: 'Arandelas Autoblocantes y Herrajes de Cortante',
        instruction:
          'Asentar los capuchones autoblocantes en los 8 pines y apretar en estrella los pernos de cuaderna FR-15 a 18,5 N·m.',
        warningText:
          'ADVERTENCIA: Asentar los 8 capuchones antes de apretar en secuencia cruzada.',
        qcm: {
          question: 'Verificación de precarga en estrella (FR-15):',
          options: [
            {
              id: 'nominal',
              label: '8 capuchones al ras y par 18,5 N·m OK',
              adaptiveGuidance:
                'QCM OK: Listo para cierre de panel Dado.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Bajo par (< 17,5 N·m) en perno #2',
              adaptiveGuidance:
                'RETRABAJO: Recalibrar llave digital y ejecutar reapriete en estrella a 18,5 N·m.',
              badgeText: 'RAMA: REAPRIETE',
            },
            {
              id: 'escalate_supervision',
              label: 'Dentado de capuchón dañado',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Sustituir capuchón y registrar lote.',
              badgeText: 'PARADA: LOTE CAP',
            },
          ],
        },
      },
      6: {
        title: 'Panel de Revestimiento Dado Carbono-Nomex',
        instruction:
          'Cerrar hojas babor y estribor del panel Dado Carbono-Nomex, alinear rejilla de descompresión y apretar cierres a 6,2 N·m.',
        warningText:
          'ADVERTENCIA: Verificar alineación de rejilla de descompresión antes de cerrar.',
        qcm: {
          question: 'Comprobación de enrasado Dado y rejilla:',
          options: [
            {
              id: 'nominal',
              label: 'Rejilla libre y escalón <= 0,5 mm',
              adaptiveGuidance:
                'QCM OK: Completar escaneo ultrasónico y certificar liberación.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Desnivel > 0,5 mm en cierre',
              adaptiveGuidance:
                'RETRABAJO: Ajustar receptáculo excéntrico y reapretar a 6,2 N·m.',
              badgeText: 'RAMA: AJUSTAR CIERRE',
            },
            {
              id: 'escalate_supervision',
              label: 'Eco de deslaminación Nomex > 1,5 dB',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Capturar foto RA para inyección de resina END.',
              badgeText: 'PARADA: END NOMEX',
            },
          ],
        },
      },
    },
  },
  turbofan_core: {
    en: {
      1: {
        title: 'LP Titanium Spool & Main Bearing Housing',
        instruction:
          'Align main bearing trunnions onto gantry datum pins following the AR arrow and seat LP spool shaft along Z0 (95.0 N·m).',
        warningText:
          'WARNING: Align anodized blue No. 1 bearing journal FORWARD (+Z).',
        qcm: {
          question: 'LP spool journal orientation & concentricity check:',
          options: [
            {
              id: 'nominal',
              label: 'Blue journal forward (+Z), runout <= 0.04 mm',
              adaptiveGuidance:
                'QCM OK: Torque bearing housing bolts to 95.0 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Runout > 0.04 mm on forward journal',
              adaptiveGuidance:
                'BRANCH REWORK: Re-index eccentric bearing liner ring and re-collinate laser.',
              badgeText: 'BRANCH: INDEX LINER',
            },
            {
              id: 'escalate_supervision',
              label: 'Spline fretting or score mark',
              adaptiveGuidance:
                'SUPERVISION HOLD: Snap AR photo of spline teeth and hold assembly.',
              badgeText: 'HOLD: SPLINE NDT',
            },
          ],
        },
      },
      2: {
        title: '18-Blade Wide-Chord Titanium Fan Rotor',
        instruction:
          'Slide 18-blade fan disk onto forward LP splines matching index #01 and torque conical spinner nut to 420.0 N·m.',
        warningText:
          'WARNING: Match master spline index mark #01 before torquing to 420 N·m.',
        qcm: {
          question: 'Master spline index #01 & hub seating check:',
          options: [
            {
              id: 'nominal',
              label: 'Index #01 aligned & full spline engagement',
              adaptiveGuidance:
                'QCM OK: Torque conical spinner locknut to 420.0 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Index mark offset by 1 tooth',
              adaptiveGuidance:
                'BRANCH REWORK: Withdraw hub 40 mm, align witness mark #01, and re-seat.',
              badgeText: 'BRANCH: RE-INDEX #01',
            },
            {
              id: 'escalate_supervision',
              label: 'Leading-edge nick on Ti fan blade',
              adaptiveGuidance:
                'SUPERVISION HOLD: Document blade nick with AR photo for blend evaluation.',
              badgeText: 'HOLD: BLADE BLEND',
            },
          ],
        },
      },
      3: {
        title: '5-Stage HP Axial Compressor Stator Case',
        instruction:
          'Mate 5-stage Inconel 718 HPC stator barrel to intermediate flange and torque 16 tie-bolts to 78.0 N·m.',
        warningText:
          'WARNING: Verify VSV actuator ring clearance at 12 o’clock before seating tie-bolts.',
        qcm: {
          question: 'VSV actuator linkage & splitline flange check:',
          options: [
            {
              id: 'nominal',
              label: 'VSV ring free & splitline flush',
              adaptiveGuidance:
                'QCM OK: Torque 16 tie-bolts to 78.0 N·m and scan weld.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'VSV bellcrank binding at 12 o’clock',
              adaptiveGuidance:
                'BRANCH REWORK: Loosen upper tie-bolts, center VSV unison ring, and re-torque.',
              badgeText: 'BRANCH: CENTER VSV',
            },
            {
              id: 'escalate_supervision',
              label: 'Splitline ultrasonic echo > 2.0 dB',
              adaptiveGuidance:
                'SUPERVISION HOLD: Log NDT anomaly comment + AR snapshot.',
              badgeText: 'HOLD: HPC NDT',
            },
          ],
        },
      },
      4: {
        title: 'Annular Combustor Liner & 12-Nozzle Fuel Rail',
        instruction:
          'Seat ceramic TBC combustor liner and connect 12-nozzle braided fuel manifold ring without flange cocking (52.0 N·m).',
        warningText:
          'WARNING: Check diffuser-to-liner seal gap (0.07–0.23 mm allowable).',
        qcm: {
          question: 'Combustor aft diffuser mating gap profile:',
          options: [
            {
              id: 'nominal',
              label: 'Uniform 0.07 – 0.23 mm seal gap',
              adaptiveGuidance:
                'QCM OK: Torque fuel rail couplings to 52.0 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Flange gap > 0.23 mm (cocked seal)',
              adaptiveGuidance:
                'BRANCH REWORK: Insert 0.19 mm laminated Inconel peel shim and re-verify laser gap.',
              badgeText: 'BRANCH: PEEL SHIM',
            },
            {
              id: 'escalate_supervision',
              label: 'TBC ceramic spallation visible',
              adaptiveGuidance:
                'SUPERVISION HOLD: Capture AR photo of liner TBC coat.',
              badgeText: 'HOLD: TBC COAT',
            },
          ],
        },
      },
      5: {
        title: 'Single-Crystal HP Turbine Rotor & Exhaust Cone',
        instruction:
          'Couple CMSX-4 HPT stage and acoustic tailcone to aft combustor flange using star-pattern torque to 160.0 N·m.',
        warningText:
          'WARNING: Torque 16 coupling bolts in strict star pattern to 160 N·m.',
        qcm: {
          question: 'HPT coupling ring Bolt #4 preload check:',
          options: [
            {
              id: 'nominal',
              label: '16 bolts at 154 – 166 N·m + angle verified',
              adaptiveGuidance:
                'QCM OK: Proceed to acoustic CFRP nacelle closure.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Bolt #4 under-torqued (< 154 N·m)',
              adaptiveGuidance:
                'BRANCH REWORK: Execute star-pattern digital re-torque to 160.0 N·m.',
              badgeText: 'BRANCH: STAR 160NM',
            },
            {
              id: 'escalate_supervision',
              label: 'Turbine tip rub detected on hand-turn',
              adaptiveGuidance:
                'SUPERVISION HOLD: Record gesture video + escalate to Propulsion QA.',
              badgeText: 'HOLD: TIP RUB',
            },
          ],
        },
      },
      6: {
        title: 'Acoustic CFRP Split Nacelle & FADEC Harness',
        instruction:
          'Close port and starboard CFRP fan cowls, latch V-band clamps (28.0 N·m), and terminate Kapton FADEC harness.',
        warningText:
          'WARNING: Route Kapton FADEC harness clear of V-band cowl latches.',
        qcm: {
          question: 'FADEC harness clearance & V-band latch check:',
          options: [
            {
              id: 'nominal',
              label: 'Harness clear & V-band torqued to 28 N·m',
              adaptiveGuidance:
                'QCM OK: Run final honeycomb NDT scan and issue Form 8130-3.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'FADEC loop near V-band latch',
              adaptiveGuidance:
                'BRANCH REWORK: Re-dress Kapton harness into upper standoff clip before latching.',
              badgeText: 'BRANCH: RE-DRESS',
            },
            {
              id: 'escalate_supervision',
              label: 'Acoustic cowl bond echo > 1.80 dB',
              adaptiveGuidance:
                'SUPERVISION HOLD: Capture AR photo and schedule resin infusion.',
              badgeText: 'HOLD: COWL NDT',
            },
          ],
        },
      },
    },
    fr: {
      1: {
        title: 'Arbre BP Titane & Carter Palier Principal',
        instruction:
          'Aligner les tourillons du palier sur les pions du bâti suivant la flèche RA et poser l’arbre BP sur l’axe Z0 (95,0 N·m).',
        warningText:
          'ATTENTION : Orienter la portée anodisée bleue du palier N°1 VERS L’AVANT (+Z).',
        qcm: {
          question: 'Contrôle orientation portée bleue & faux-rond arbre BP :',
          options: [
            {
              id: 'nominal',
              label: 'Portée bleue avant (+Z), faux-rond <= 0,04 mm',
              adaptiveGuidance:
                'QCM CONFORME : Serrer le carter palier à 95,0 N·m.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Faux-rond > 0,04 mm mesuré',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Ré-indexer la bague excentrique du palier N°1.',
              badgeText: 'BRANCHE : BAGUE N°1',
            },
            {
              id: 'escalate_supervision',
              label: 'Marquage sur cannelures titane',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Prendre photo RA des cannelures et bloquer l’étape.',
              badgeText: 'ARRÊT : CND ARBRE',
            },
          ],
        },
      },
      2: {
        title: 'Rotor Soufflante Titane 18 Aubes Large Corde',
        instruction:
          'Engager le disque soufflante sur les cannelures BP au repère #01 et serrer l’écrou conique à 420,0 N·m.',
        warningText:
          'ATTENTION : Aligner le repère maître #01 avant serrage à 420 N·m.',
        qcm: {
          question: 'Alignement repère cannelure #01 & appui moyeu :',
          options: [
            {
              id: 'nominal',
              label: 'Repère #01 aligné & engagement complet',
              adaptiveGuidance:
                'QCM CONFORME : Serrer l’écrou de cône à 420,0 N·m.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Décalage d’une dent sur repère #01',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Reculer le moyeu de 40 mm, réaligner #01 et réengager.',
              badgeText: 'BRANCHE : REPÈRE #01',
            },
            {
              id: 'escalate_supervision',
              label: 'Impact bord d’attaque aube titane',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Photographier l’impact en RA pour expertise.',
              badgeText: 'ARRÊT : AUBE TI',
            },
          ],
        },
      },
      3: {
        title: 'Carter Stator Compresseur HP 5 Étages',
        instruction:
          'Accoster le carter compresseur HP Inconel 718 sur la bride intermédiaire et serrer les 16 tirants à 78,0 N·m.',
        warningText:
          'ATTENTION : Vérifier le jeu de l’anneau VSV à 12h avant serrage.',
        qcm: {
          question: 'Vérification cinématique anneau VSV & plan de joint :',
          options: [
            {
              id: 'nominal',
              label: 'Anneau VSV libre & bride affleurante',
              adaptiveGuidance:
                'QCM CONFORME : Serrer les 16 tirants à 78,0 N·m.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Point dur biellette VSV à 12h',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Desserrer les tirants hauts, centrer l’anneau VSV et resserrer.',
              badgeText: 'BRANCHE : CENTRER VSV',
            },
            {
              id: 'escalate_supervision',
              label: 'Écho ultrasonore > 2,0 dB sur cordon',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Joindre photo RA + commentaire CND.',
              badgeText: 'ARRÊT : CND HPC',
            },
          ],
        },
      },
      4: {
        title: 'Chambre de Combustion Annulaire & Rampe 12 Injecteurs',
        instruction:
          'Poser la chambre à barrière thermique céramique et raccorder la rampe carburant 12 injecteurs sans désalignement (52,0 N·m).',
        warningText:
          'ATTENTION : Contrôler le jeu diffuseur/chambre (0,07–0,23 mm autorisé).',
        qcm: {
          question: 'Profil de jeu laser sur bride arrière diffuseur :',
          options: [
            {
              id: 'nominal',
              label: 'Jeu uniforme entre 0,07 et 0,23 mm',
              adaptiveGuidance:
                'QCM CONFORME : Serrer les raccords rampe à 52,0 N·m.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Jeu > 0,23 mm (bride voilée)',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Insérer une cale pelable Inconel de 0,19 mm et recontrôler.',
              badgeText: 'BRANCHE : CALE 0,19MM',
            },
            {
              id: 'escalate_supervision',
              label: 'Écaillage revêtement céramique TBC',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Capturer photo RA de la virole interne.',
              badgeText: 'ARRÊT : VIROLE TBC',
            },
          ],
        },
      },
      5: {
        title: 'Rotor Turbine HP Monocristallin & Cône d’Échappement',
        instruction:
          'Accoupler le disque HPT CMSX-4 et le cône acoustique sur la bride arrière en étoile à 160,0 N·m.',
        warningText:
          'ATTENTION : Serrer les 16 boulons en étoile stricte à 160 N·m.',
        qcm: {
          question: 'Contrôle précharge boulon #4 couronne HPT :',
          options: [
            {
              id: 'nominal',
              label: '16 boulons entre 154–166 N·m + angle OK',
              adaptiveGuidance:
                'QCM CONFORME : Passer à la fermeture des capots CFRP.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Sous-couple boulon #4 (< 154 N·m)',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Reprendre le serrage croisé numérique à 160,0 N·m.',
              badgeText: 'BRANCHE : ÉTOILE 160NM',
            },
            {
              id: 'escalate_supervision',
              label: 'Frottement sommet d’aube en rotation manuelle',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Enregistrer clip vidéo geste + alerter Qualité.',
              badgeText: 'ARRÊT : JEU HPT',
            },
          ],
        },
      },
      6: {
        title: 'Nacelle Acoustique CFRP & Harnais FADEC',
        instruction:
          'Refermer les demi-capots CFRP bâbord/tribord, verrouiller les colliers V-Band (28,0 N·m) et connecter le boîtier FADEC.',
        warningText:
          'ATTENTION : Dégager le harnais Kapton FADEC des verrous V-Band.',
        qcm: {
          question: 'Garde du harnais FADEC & verrouillage V-Band :',
          options: [
            {
              id: 'nominal',
              label: 'Harnais dégagé & collier V-Band à 28 N·m',
              adaptiveGuidance:
                'QCM CONFORME : Effectuer le scan CND final et émettre le Form 8130-3.',
              badgeText: 'QCM CONFORME',
            },
            {
              id: 'corrective_rework',
              label: 'Boucle FADEC proche du verrou V-Band',
              adaptiveGuidance:
                'ACTION CORRECTIVE : Brider la gaine Kapton dans le clip supérieur avant fermeture.',
              badgeText: 'BRANCHE : BRIDAGE FADEC',
            },
            {
              id: 'escalate_supervision',
              label: 'Écho collage nid d’abeille > 1,80 dB',
              adaptiveGuidance:
                'ALERTE SUPERVISION : Prendre photo RA pour réparation résine.',
              badgeText: 'ARRÊT : CND CAPOT',
            },
          ],
        },
      },
    },
    es: {
      1: {
        title: 'Eje BP de Titanio y Alojamiento de Rodamiento',
        instruction:
          'Alinear muñones del rodamiento en los pines guía siguiendo la flecha RA y asentar el eje BP en Z0 (95,0 N·m).',
        warningText:
          'ADVERTENCIA: Orientar el muñón azul N°1 HACIA ADELANTE (+Z).',
        qcm: {
          question: 'Orientación de muñón azul y excentricidad del eje BP:',
          options: [
            {
              id: 'nominal',
              label: 'Muñón azul (+Z) y excentricidad <= 0,04 mm',
              adaptiveGuidance:
                'QCM OK: Apretar alojamiento a 95,0 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Excentricidad > 0,04 mm detectada',
              adaptiveGuidance:
                'RETRABAJO: Reindexar anillo excéntrico delantero y recolimar láser.',
              badgeText: 'RAMA: INDEXAR ANILLO',
            },
            {
              id: 'escalate_supervision',
              label: 'Marca en estrías de titanio',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Capturar foto RA de estrías y detener.',
              badgeText: 'PARADA: END EJE',
            },
          ],
        },
      },
      2: {
        title: 'Rotor Fan de Titanio de 18 Álabes',
        instruction:
          'Deslizar disco fan sobre estrías BP alineando marca #01 y apretar tuerca cónica a 420,0 N·m.',
        warningText:
          'ADVERTENCIA: Alinear marca maestra #01 antes de apretar a 420 N·m.',
        qcm: {
          question: 'Alineación de marca maestra #01 en cubo fan:',
          options: [
            {
              id: 'nominal',
              label: 'Marca #01 alineada y acople total',
              adaptiveGuidance:
                'QCM OK: Apretar tuerca cónica a 420,0 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Desfase de 1 diente en marca #01',
              adaptiveGuidance:
                'RETRABAJO: Retirar cubo 40 mm, alinear #01 y reasentar.',
              badgeText: 'RAMA: MARCA #01',
            },
            {
              id: 'escalate_supervision',
              label: 'Mella en borde de ataque de álabe',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Fotografiar álabe en RA para evaluación.',
              badgeText: 'PARADA: ÁLABE TI',
            },
          ],
        },
      },
      3: {
        title: 'Cárter Estator Compresor HP de 5 Etapas',
        instruction:
          'Acoplar barril estator Inconel 718 a brida intermedia y apretar 16 pernos a 78,0 N·m.',
        warningText:
          'ADVERTENCIA: Verificar holgura del anillo VSV a las 12h.',
        qcm: {
          question: 'Movimiento libre del anillo VSV y unión de brida:',
          options: [
            {
              id: 'nominal',
              label: 'Anillo VSV libre y brida enrasada',
              adaptiveGuidance:
                'QCM OK: Apretar 16 pernos a 78,0 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Roce en bieleta VSV a las 12h',
              adaptiveGuidance:
                'RETRABAJO: Aflojar pernos superiores, centrar anillo VSV y reapretar.',
              badgeText: 'RAMA: CENTRAR VSV',
            },
            {
              id: 'escalate_supervision',
              label: 'Eco ultrasónico > 2,0 dB en soldadura',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Registrar anomalía END con foto RA.',
              badgeText: 'PARADA: END HPC',
            },
          ],
        },
      },
      4: {
        title: 'Cámara de Combustión Anular y Riel de 12 Inyectores',
        instruction:
          'Asentar revestimiento cerámico TBC y conectar colector trenzado de 12 inyectores sin inclinación (52,0 N·m).',
        warningText:
          'ADVERTENCIA: Comprobar holgura difusor-cámara (0,07–0,23 mm).',
        qcm: {
          question: 'Perfil de holgura láser en sello posterior:',
          options: [
            {
              id: 'nominal',
              label: 'Holgura uniforme 0,07 – 0,23 mm',
              adaptiveGuidance:
                'QCM OK: Apretar racores de combustible a 52,0 N·m.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Holgura > 0,23 mm detectada',
              adaptiveGuidance:
                'RETRABAJO: Insertar suplemento laminado Inconel de 0,19 mm.',
              badgeText: 'RAMA: SUPLEMENTO 0,19MM',
            },
            {
              id: 'escalate_supervision',
              label: 'Desprendimiento térmico TBC visible',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Tomar foto RA del revestimiento TBC.',
              badgeText: 'PARADA: TBC',
            },
          ],
        },
      },
      5: {
        title: 'Rotor Turbina HP Monocristal y Cono de Escape',
        instruction:
          'Acoplar etapa HPT CMSX-4 y cono acústico a brida posterior en secuencia estrella a 160,0 N·m.',
        warningText:
          'ADVERTENCIA: Apretar los 16 pernos en estrella estricta a 160 N·m.',
        qcm: {
          question: 'Precarga de Perno #4 en anillo HPT:',
          options: [
            {
              id: 'nominal',
              label: '16 pernos entre 154–166 N·m + ángulo OK',
              adaptiveGuidance:
                'QCM OK: Proceder al cierre de góndola CFRP.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Perno #4 bajo par (< 154 N·m)',
              adaptiveGuidance:
                'RETRABAJO: Ejecutar reapriete digital en estrella a 160,0 N·m.',
              badgeText: 'RAMA: ESTRELLA 160NM',
            },
            {
              id: 'escalate_supervision',
              label: 'Roce de punta de álabe al giro manual',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Grabar clip de video y avisar a Calidad.',
              badgeText: 'PARADA: ROCE HPT',
            },
          ],
        },
      },
      6: {
        title: 'Góndola Acústica CFRP y Arnés FADEC',
        instruction:
          'Cerrar capós CFRP babor y estribor, bloquear abrazaderas V-Band (28,0 N·m) y conectar unidad FADEC.',
        warningText:
          'ADVERTENCIA: Separar arnés Kapton FADEC de los cierres V-Band.',
        qcm: {
          question: 'Separación de arnés FADEC y cierre V-Band:',
          options: [
            {
              id: 'nominal',
              label: 'Arnés libre y V-Band apretado a 28 N·m',
              adaptiveGuidance:
                'QCM OK: Realizar escaneo END final y emitir Form 8130-3.',
              badgeText: 'QCM NOMINAL',
            },
            {
              id: 'corrective_rework',
              label: 'Bucle FADEC próximo a cierre V-Band',
              adaptiveGuidance:
                'RETRABAJO: Fijar funda Kapton en clip superior antes de cerrar.',
              badgeText: 'RAMA: FIJAR FADEC',
            },
            {
              id: 'escalate_supervision',
              label: 'Eco en panal acústico > 1,80 dB',
              adaptiveGuidance:
                'PARADA SUPERVISIÓN: Tomar foto RA para infusión de resina.',
              badgeText: 'PARADA: END CAPÓ',
            },
          ],
        },
      },
    },
  },
});

function buildDefaultScenarioMarkers(
  scenarioId: ScenarioId,
): DimeoSpatialMarker[] {
  if (scenarioId === 'panel_buildup') {
    return [
      {
        id: 'mk_panel_s1_arrow',
        stepNumber: 1,
        type: 'arrow',
        label: 'POI-01 · 40mm Pins',
        worldPosition: [-0.18, 1.38, -1.36],
        direction: [0, -0.35, -0.94],
        colorHex: '#38bdf8',
        customAuthoring: false,
      },
      {
        id: 'mk_panel_s1_ring',
        stepNumber: 1,
        type: 'circle_ring',
        label: 'Spot P3 · 40.0mm',
        worldPosition: [0.09, 1.4, -1.39],
        direction: [0, 0, 1],
        colorHex: '#34d399',
        customAuthoring: false,
      },
      {
        id: 'mk_panel_s2_arrow',
        stepNumber: 2,
        type: 'arrow',
        label: 'Tab +Y · 8.5 N·m',
        worldPosition: [0.19, 1.42, -1.35],
        direction: [0, 1, 0],
        colorHex: '#60a5fa',
        customAuthoring: false,
      },
      {
        id: 'mk_panel_s3_poi',
        stepNumber: 3,
        type: 'poi_pin',
        label: 'POI-03 · Kapton +Z',
        worldPosition: [0.0, 1.24, -1.34],
        direction: [0, 1, 0],
        colorHex: '#fbbf24',
        customAuthoring: false,
      },
      {
        id: 'mk_panel_s4_warn',
        stepNumber: 4,
        type: 'warning_cone',
        label: 'Gap >= 6.5mm',
        worldPosition: [0.14, 1.27, -1.29],
        direction: [0, 1, 0],
        colorHex: '#f59e0b',
        customAuthoring: false,
      },
      {
        id: 'mk_panel_s5_ring',
        stepNumber: 5,
        type: 'circle_ring',
        label: 'Star 18.5 N·m',
        worldPosition: [-0.2, 1.08, -1.28],
        direction: [0, 0, 1],
        colorHex: '#34d399',
        customAuthoring: false,
      },
      {
        id: 'mk_panel_s6_poi',
        stepNumber: 6,
        type: 'poi_pin',
        label: 'POI-06 · Louver',
        worldPosition: [0.22, 1.12, -1.25],
        direction: [0, 1, 0],
        colorHex: '#a78bfa',
        customAuthoring: false,
      },
    ];
  }

  return [
    {
      id: 'mk_tf_s1_arrow',
      stepNumber: 1,
      type: 'arrow',
      label: 'Fwd Sump +Z · 95 N·m',
      worldPosition: [0.0, 1.32, -1.38],
      direction: [0, -0.5, -0.86],
      colorHex: '#38bdf8',
      customAuthoring: false,
    },
    {
      id: 'mk_tf_s2_ring',
      stepNumber: 2,
      type: 'circle_ring',
      label: 'Spline #01 · 420 N·m',
      worldPosition: [0.0, 1.24, -1.18],
      direction: [0, 0, 1],
      colorHex: '#60a5fa',
      customAuthoring: false,
    },
    {
      id: 'mk_tf_s3_poi',
      stepNumber: 3,
      type: 'poi_pin',
      label: 'POI-03 · VSV 12h',
      worldPosition: [0.0, 1.44, -1.39],
      direction: [0, 1, 0],
      colorHex: '#fbbf24',
      customAuthoring: false,
    },
    {
      id: 'mk_tf_s4_warn',
      stepNumber: 4,
      type: 'warning_cone',
      label: 'Seal 0.15mm',
      worldPosition: [-0.18, 1.38, -1.55],
      direction: [0, 1, 0],
      colorHex: '#f59e0b',
      customAuthoring: false,
    },
    {
      id: 'mk_tf_s5_arrow',
      stepNumber: 5,
      type: 'arrow',
      label: 'Bolt #4 · 160 N·m',
      worldPosition: [0.16, 1.36, -1.68],
      direction: [-0.3, -0.6, 0.74],
      colorHex: '#34d399',
      customAuthoring: false,
    },
    {
      id: 'mk_tf_s6_poi',
      stepNumber: 6,
      type: 'poi_pin',
      label: 'POI-06 · FADEC Clip',
      worldPosition: [0.27, 1.32, -1.42],
      direction: [0, 1, 0],
      colorHex: '#a78bfa',
      customAuthoring: false,
    },
  ];
}

export const DEFAULT_RAW_TECHNICIAN_NOTES: Readonly<
  Record<DimeoLanguage, string>
> = Object.freeze({
  en: `1. Degrease upper helicopter mast collar and inspect bearing seal (warning: wear nitrile gloves, zero lint).
2. Position titanium pitch-link clevis onto swashplate lug and insert calibrated bolt at 24.5 N·m (tolerance 0.15 mm).
3. Lock castellated nut with 0.8 mm Inconel safety wire and verify free cyclic travel.`,
  fr: `1. Dégraisser la collerette du mât rotor hélicoptère et contrôler le joint (attention : gants nitrile obligatoires, zéro peluche).
2. Positionner la chape de biellette de pas en titane sur le plateau cyclique et serrer au couple de 24.5 N·m (jeu max 0.15 mm).
3. Freiner l'écrou crénelé au fil Inconel 0.8 mm et vérifier le débattement libre.`,
  es: `1. Desengrasar el collarín del mástil del helicóptero y revisar el sello (atención: usar guantes de nitrilo sin pelusa).
2. Colocar la horquilla de titanio en el plato cíclico y apretar el perno a 24.5 N·m (holgura 0.15 mm).
3. Asegurar la tuerca almenada con alambre Inconel de 0.8 mm y comprobar recorrido libre.`,
});

/**
 * Parses multilingual hands-free voice transcripts (FR / EN / ES) into deterministic
 * Android XR Dimeo operator actions.
 */
export function parseDimeoVoiceCommand(
  rawTranscript: string,
): DimeoVoiceAction | null {
  const norm = rawTranscript
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!norm) return null;

  if (/\b(suivant|next|siguiente|avancer|forward)\b/.test(norm)) {
    return 'next_step';
  }
  if (/\b(precedent|previous|prev|anterior|retour|back)\b/.test(norm)) {
    return 'prev_step';
  }
  if (/\b(valider|validate|confirm|confirmer|validar|terminer)\b/.test(norm)) {
    return 'validate_step';
  }
  if (/\b(photo|snapshot|capture|foto|camera)\b/.test(norm)) {
    return 'capture_photo';
  }
  if (/\b(suivre|follow|epingler|pin|anclar|seguir)\b/.test(norm)) {
    return 'toggle_follow_head';
  }
  if (/\b(lire|lecture|read|speak|audio|leer)\b/.test(norm)) {
    return 'read_aloud';
  }
  if (/\b(fleche|arrow|flecha)\b/.test(norm)) {
    return 'place_arrow';
  }
  if (/\b(cercle|circle|anneau|circulo)\b/.test(norm)) {
    return 'place_circle';
  }
  if (/\b(poi|interet|balise|marker)\b/.test(norm)) {
    return 'place_poi';
  }
  if (/\b(repere|reperes|classique|classic|toggle ar)\b/.test(norm)) {
    return 'toggle_ar';
  }
  return null;
}

/**
 * Core pure-TypeScript state & confidential on-device NLP engine for the
 * Innoteo Dimeo -> Android XR industrial suite:
 * - Dimeo Player (FR/EN/ES, AR visual markers, Wayfinding, Follow-Head, Voice, QCM branching, Photos, Comments, Video)
 * - Dimeo Recorder (Field Know-How capture -> 1-click playable module)
 * - Dimeo Editor & On-Device AI (Structure raw notes, Reformulate, Translate, CAD Digital Twin, Shared Station, CSV/JSON Export)
 */
export class DimeoAndroidXrEngine {
  private language: DimeoLanguage = 'en';
  private activePillar: DimeoSuitePillar = 'player';
  private arIndicatorsEnabled = true;
  private wayfindingEnabled = true;
  private followHeadEnabled = false;
  private voiceListening = false;
  private lastVoiceTranscript = '';

  private accountMode: DimeoAccountMode = 'nominative';
  private sharedStationBadge: string = SHARED_STATION_BADGES[0].badge;

  private digitalTwinVisible = false;
  private digitalTwinScale: DimeoDigitalTwinScale = '0.35x_tabletop';
  private importedCadFileName = '';

  private placementTool: DimeoMarkerType | null = null;
  private markersByScenario: Record<ScenarioId, DimeoSpatialMarker[]> = {
    panel_buildup: buildDefaultScenarioMarkers('panel_buildup'),
    turbofan_core: buildDefaultScenarioMarkers('turbofan_core'),
  };

  private qcmAnswers = new Map<string, DimeoQcmOutcome>();
  private validatedSteps = new Set<string>();
  private photos: DimeoPhotoEvidence[] = [];
  private comments: DimeoOperatorComment[] = [];
  private videoClips: DimeoGestureVideoClip[] = [];

  // Field Recorder ("Captation Terrain") state
  private fieldRecordingActive = false;
  private recordedDraftSteps: DimeoAuthoredStep[] = [];

  // Custom / AI-Structured Playable Module override (when published from Recorder or AI Editor)
  private customModuleActive = false;
  private customModuleTitle = '';
  private customSteps: DimeoAuthoredStep[] = [];
  private markerSeq = 100;

  getLanguage(): DimeoLanguage {
    return this.language;
  }

  setLanguage(lang: DimeoLanguage): void {
    this.language = lang;
    if (this.customModuleActive && this.customSteps.length > 0) {
      this.translateCustomStepsWithAi(lang);
    }
  }

  cycleLanguage(): DimeoLanguage {
    const order: readonly DimeoLanguage[] = ['en', 'fr', 'es'];
    const idx = order.indexOf(this.language);
    const next = order[(idx + 1) % order.length];
    this.setLanguage(next);
    return next;
  }

  getUiStrings(): DimeoLocalizedUiStrings {
    return UI_STRINGS[this.language];
  }

  getActivePillar(): DimeoSuitePillar {
    return this.activePillar;
  }

  setActivePillar(pillar: DimeoSuitePillar): void {
    this.activePillar = pillar;
  }

  isArIndicatorsEnabled(): boolean {
    return this.arIndicatorsEnabled;
  }

  setArIndicatorsEnabled(enabled: boolean): void {
    this.arIndicatorsEnabled = enabled;
    if (!enabled) {
      this.placementTool = null;
    }
  }

  toggleArIndicators(): boolean {
    this.setArIndicatorsEnabled(!this.arIndicatorsEnabled);
    return this.arIndicatorsEnabled;
  }

  isWayfindingEnabled(): boolean {
    return this.wayfindingEnabled;
  }

  toggleWayfinding(): boolean {
    this.wayfindingEnabled = !this.wayfindingEnabled;
    return this.wayfindingEnabled;
  }

  isFollowHeadEnabled(): boolean {
    return this.followHeadEnabled;
  }

  setFollowHeadEnabled(enabled: boolean): void {
    this.followHeadEnabled = enabled;
  }

  toggleFollowHead(): boolean {
    this.followHeadEnabled = !this.followHeadEnabled;
    return this.followHeadEnabled;
  }

  isVoiceListening(): boolean {
    return this.voiceListening;
  }

  setVoiceListening(active: boolean, transcript?: string): void {
    this.voiceListening = active;
    if (transcript !== undefined) {
      this.lastVoiceTranscript = transcript;
    }
  }

  getLastVoiceTranscript(): string {
    return this.lastVoiceTranscript;
  }

  getAccountMode(): DimeoAccountMode {
    return this.accountMode;
  }

  setAccountMode(mode: DimeoAccountMode): void {
    this.accountMode = mode;
  }

  getSharedStationBadge(): string {
    return this.sharedStationBadge;
  }

  setSharedStationBadge(badge: string): void {
    const valid = SHARED_STATION_BADGES.some((b) => b.badge === badge);
    if (valid) {
      this.sharedStationBadge = badge;
    }
  }

  resolveEffectiveOperatorLabel(nominativeName?: string | null): string {
    if (this.accountMode === 'shared_station') {
      return this.sharedStationBadge;
    }
    return (nominativeName ?? '').trim() || 'EVAL-OPERATOR';
  }

  isDigitalTwinVisible(): boolean {
    return this.digitalTwinVisible;
  }

  setDigitalTwinVisible(visible: boolean): void {
    this.digitalTwinVisible = visible;
  }

  toggleDigitalTwin(): boolean {
    this.digitalTwinVisible = !this.digitalTwinVisible;
    return this.digitalTwinVisible;
  }

  getDigitalTwinScale(): DimeoDigitalTwinScale {
    return this.digitalTwinScale;
  }

  setDigitalTwinScale(scale: DimeoDigitalTwinScale): void {
    this.digitalTwinScale = scale;
    this.digitalTwinVisible = true;
  }

  getDigitalTwinNumericScale(): number {
    if (this.digitalTwinScale === '1:1') return 1.0;
    if (this.digitalTwinScale === '0.5x') return 0.5;
    return 0.35;
  }

  getImportedCadFileName(): string {
    return this.importedCadFileName;
  }

  setImportedCadFileName(fileName: string): void {
    this.importedCadFileName = fileName.trim();
    if (this.importedCadFileName) {
      this.digitalTwinVisible = true;
    }
  }

  getPlacementTool(): DimeoMarkerType | null {
    return this.placementTool;
  }

  setPlacementTool(tool: DimeoMarkerType | null): void {
    this.placementTool = tool;
    if (tool) {
      this.arIndicatorsEnabled = true;
    }
  }

  isCustomModuleActive(): boolean {
    return this.customModuleActive && this.customSteps.length > 0;
  }

  getCustomModuleTitle(): string {
    return this.customModuleTitle;
  }

  getCustomSteps(): readonly DimeoAuthoredStep[] {
    return this.customSteps;
  }

  exitCustomModule(): void {
    this.customModuleActive = false;
  }

  /**
   * Resolves localized title, instruction, warning, and QCM branching state
   * for the active step (supporting both standard aerospace work orders and
   * custom Recorded / AI-Structured modules).
   */
  resolveStepPresentation(
    scenarioId: ScenarioId,
    stepNumber: number,
    fallbackTitle: string,
    fallbackInstruction: string,
    fallbackWarning: string,
  ): {
    readonly title: string;
    readonly instruction: string;
    readonly warningText: string;
    readonly qcm: DimeoStepQcmSpec;
    readonly selectedQcm: DimeoQcmOutcome | null;
    readonly adaptiveBanner: string;
    readonly validated: boolean;
  } {
    const clampedStep = Math.max(1, Math.min(6, Math.round(stepNumber)));
    const key = this.makeStepKey(scenarioId, clampedStep);
    const selectedQcm = this.qcmAnswers.get(key) ?? null;
    const validated = this.validatedSteps.has(key);

    if (this.isCustomModuleActive()) {
      const custom =
        this.customSteps[(clampedStep - 1) % this.customSteps.length];
      const chosenOpt = custom.qcm.options.find((o) => o.id === selectedQcm);
      return {
        title: custom.title,
        instruction: chosenOpt
          ? `${custom.instruction}\n• ${chosenOpt.adaptiveGuidance}`
          : custom.instruction,
        warningText: custom.warningText,
        qcm: custom.qcm,
        selectedQcm,
        adaptiveBanner: chosenOpt ? chosenOpt.adaptiveGuidance : '',
        validated,
      };
    }

    const localized =
      LOCALIZED_SCENARIO_STEPS[scenarioId]?.[this.language]?.[clampedStep];
    if (!localized) {
      const defaultQcm = this.buildDefaultQcmForText(fallbackTitle, this.language);
      return {
        title: fallbackTitle,
        instruction: fallbackInstruction,
        warningText: fallbackWarning,
        qcm: defaultQcm,
        selectedQcm,
        adaptiveBanner: '',
        validated,
      };
    }

    // If user stays in English and edited the step in Firebase Workflow Manager, preserve custom edits
    const useFallbackEdits = this.language === 'en';
    const baseTitle = useFallbackEdits ? fallbackTitle : localized.title;
    const baseInstruction = useFallbackEdits
      ? fallbackInstruction
      : localized.instruction;
    const baseWarning = useFallbackEdits
      ? fallbackWarning
      : localized.warningText;

    const chosenOpt = localized.qcm.options.find((o) => o.id === selectedQcm);
    return {
      title: baseTitle,
      instruction: chosenOpt
        ? `${baseInstruction}\n• ${chosenOpt.adaptiveGuidance}`
        : baseInstruction,
      warningText: baseWarning,
      qcm: localized.qcm,
      selectedQcm,
      adaptiveBanner: chosenOpt ? chosenOpt.adaptiveGuidance : '',
      validated,
    };
  }

  answerStepQcm(
    scenarioId: ScenarioId,
    stepNumber: number,
    outcome: DimeoQcmOutcome,
  ): void {
    const key = this.makeStepKey(scenarioId, stepNumber);
    this.qcmAnswers.set(key, outcome);
    if (outcome === 'nominal') {
      this.validatedSteps.add(key);
    }
  }

  getStepQcmAnswer(
    scenarioId: ScenarioId,
    stepNumber: number,
  ): DimeoQcmOutcome | null {
    return this.qcmAnswers.get(this.makeStepKey(scenarioId, stepNumber)) ?? null;
  }

  validateStep(scenarioId: ScenarioId, stepNumber: number): void {
    const key = this.makeStepKey(scenarioId, stepNumber);
    this.validatedSteps.add(key);
    if (!this.qcmAnswers.has(key)) {
      this.qcmAnswers.set(key, 'nominal');
    }
  }

  isStepValidated(scenarioId: ScenarioId, stepNumber: number): boolean {
    return this.validatedSteps.has(this.makeStepKey(scenarioId, stepNumber));
  }

  getValidatedStepCount(scenarioId: ScenarioId): number {
    const prefix = this.isCustomModuleActive() ? 'custom:' : `${scenarioId}:`;
    let count = 0;
    for (const k of this.validatedSteps) {
      if (k.startsWith(prefix)) count++;
    }
    return count;
  }

  getAnsweredQcmCount(scenarioId: ScenarioId): number {
    const prefix = this.isCustomModuleActive() ? 'custom:' : `${scenarioId}:`;
    let count = 0;
    for (const k of this.qcmAnswers.keys()) {
      if (k.startsWith(prefix)) count++;
    }
    return count;
  }

  // =========================================================================
  // 3D Spatial AR Visual Markers (Arrows, Rings, Numbered POIs, Cones)
  // =========================================================================
  getMarkersForScenario(scenarioId: ScenarioId): readonly DimeoSpatialMarker[] {
    if (this.isCustomModuleActive()) {
      return this.customSteps.map((st) => ({
        id: `mk_custom_${st.stepNumber}`,
        stepNumber: st.stepNumber,
        type: st.markerType,
        label: `POI-0${st.stepNumber} · ${st.title.slice(0, 18)}`,
        worldPosition: st.worldPosition,
        direction: [0, -0.5, -0.86],
        colorHex:
          st.markerType === 'warning_cone'
            ? '#f59e0b'
            : st.markerType === 'circle_ring'
              ? '#34d399'
              : '#38bdf8',
        customAuthoring: true,
      }));
    }
    return this.markersByScenario[scenarioId];
  }

  getActiveStepMarkers(
    scenarioId: ScenarioId,
    stepNumber: number,
  ): readonly DimeoSpatialMarker[] {
    if (!this.arIndicatorsEnabled) return [];
    const all = this.getMarkersForScenario(scenarioId);
    // Return markers for the active step plus any custom-placed markers on that step
    return all.filter((m) => m.stepNumber === stepNumber);
  }

  placeSpatialMarker(
    scenarioId: ScenarioId,
    stepNumber: number,
    type: DimeoMarkerType,
    worldPosition: readonly [number, number, number],
    customLabel?: string,
  ): DimeoSpatialMarker {
    this.markerSeq += 1;
    const defaultLabel =
      type === 'arrow'
        ? `Arrow #${this.markerSeq}`
        : type === 'circle_ring'
          ? `Zone #${this.markerSeq}`
          : type === 'warning_cone'
            ? `Caution #${this.markerSeq}`
            : `POI #${this.markerSeq}`;
    const label = (customLabel ?? '').trim().slice(0, 32) || defaultLabel;
    const colorHex =
      type === 'warning_cone'
        ? '#f59e0b'
        : type === 'circle_ring'
          ? '#34d399'
          : type === 'poi_pin'
            ? '#a78bfa'
            : '#38bdf8';

    const marker: DimeoSpatialMarker = {
      id: `mk_usr_${this.markerSeq}`,
      stepNumber: Math.max(1, Math.min(6, Math.round(stepNumber))),
      type,
      label,
      worldPosition: [
        round3(worldPosition[0]),
        round3(worldPosition[1]),
        round3(worldPosition[2]),
      ],
      direction: [0, -0.6, -0.8],
      colorHex,
      customAuthoring: true,
    };

    this.markersByScenario[scenarioId] = [
      ...this.markersByScenario[scenarioId],
      marker,
    ];
    this.placementTool = null;
    return marker;
  }

  removeSpatialMarker(scenarioId: ScenarioId, markerId: string): boolean {
    const before = this.markersByScenario[scenarioId].length;
    this.markersByScenario[scenarioId] = this.markersByScenario[
      scenarioId
    ].filter((m) => m.id !== markerId);
    return this.markersByScenario[scenarioId].length < before;
  }

  // =========================================================================
  // Field Feedback: 3D Photos, Categorized Comments & Gesture Video Clips
  // =========================================================================
  attachStepPhoto(params: {
    readonly stepNumber: number;
    readonly dataUrl: string;
    readonly caption?: string;
    readonly operatorLabel?: string;
  }): DimeoPhotoEvidence {
    const item: DimeoPhotoEvidence = {
      id: `ph_${Date.now()}_${this.photos.length + 1}`,
      stepNumber: Math.max(1, Math.min(6, Math.round(params.stepNumber))),
      dataUrl: params.dataUrl,
      caption:
        (params.caption ?? '').trim().slice(0, 80) ||
        `Step 0${params.stepNumber} AR Verification`,
      capturedAtIso: new Date().toISOString(),
      operatorLabel:
        params.operatorLabel ?? this.resolveEffectiveOperatorLabel(),
    };
    this.photos = [item, ...this.photos].slice(0, 12);
    return item;
  }

  getPhotos(): readonly DimeoPhotoEvidence[] {
    return this.photos;
  }

  addStepComment(params: {
    readonly stepNumber: number;
    readonly category: DimeoCommentCategory;
    readonly message: string;
    readonly authorBadge?: string;
  }): {ok: true; comment: DimeoOperatorComment} | {ok: false; error: string} {
    const clean = params.message.trim().replace(/\s+/g, ' ');
    if (clean.length < 3) {
      return {
        ok: false,
        error: 'Enter at least 3 characters for the field comment.',
      };
    }
    const comment: DimeoOperatorComment = {
      id: `cm_${Date.now()}_${this.comments.length + 1}`,
      stepNumber: Math.max(1, Math.min(6, Math.round(params.stepNumber))),
      category: params.category,
      message: clean.slice(0, 240),
      authorBadge:
        (params.authorBadge ?? '').trim() ||
        this.resolveEffectiveOperatorLabel(),
      createdAtIso: new Date().toISOString(),
    };
    this.comments = [comment, ...this.comments].slice(0, 24);
    return {ok: true, comment};
  }

  getComments(): readonly DimeoOperatorComment[] {
    return this.comments;
  }

  attachGestureVideoClip(params: {
    readonly stepNumber: number;
    readonly durationSec: number;
    readonly downloadUrl: string;
    readonly mimeType: string;
  }): DimeoGestureVideoClip {
    const clip: DimeoGestureVideoClip = {
      id: `vid_${Date.now()}_${this.videoClips.length + 1}`,
      stepNumber: Math.max(1, Math.min(6, Math.round(params.stepNumber))),
      durationSec: Math.max(0.5, round2(params.durationSec)),
      downloadUrl: params.downloadUrl,
      mimeType: params.mimeType || 'video/webm',
      recordedAtIso: new Date().toISOString(),
    };
    this.videoClips = [clip, ...this.videoClips].slice(0, 6);
    return clip;
  }

  getVideoClips(): readonly DimeoGestureVideoClip[] {
    return this.videoClips;
  }

  // =========================================================================
  // Pillar 2: Dimeo Recorder ("Captation Terrain du Savoir-Faire")
  // =========================================================================
  isFieldRecordingActive(): boolean {
    return this.fieldRecordingActive;
  }

  startFieldRecording(): void {
    this.fieldRecordingActive = true;
    this.recordedDraftSteps = [];
  }

  stopFieldRecording(): void {
    this.fieldRecordingActive = false;
  }

  getRecordedDraftSteps(): readonly DimeoAuthoredStep[] {
    return this.recordedDraftSteps;
  }

  captureFieldStep(params: {
    readonly noteText: string;
    readonly markerType: DimeoMarkerType;
    readonly worldPosition: readonly [number, number, number];
    readonly snapshotDataUrl?: string;
  }): {ok: true; step: DimeoAuthoredStep} | {ok: false; error: string} {
    const clean = params.noteText.trim().replace(/\s+/g, ' ');
    if (clean.length < 4) {
      return {
        ok: false,
        error: 'Provide a spoken or typed field step description (>= 4 chars).',
      };
    }
    if (this.recordedDraftSteps.length >= 6) {
      return {
        ok: false,
        error: 'Maximum 6 steps per rapid field capture module reached.',
      };
    }

    const stepNumber = this.recordedDraftSteps.length + 1;
    const parsed = this.extractStructuredMetricsFromSentence(clean);
    const title = parsed.shortTitle || `Field Step 0${stepNumber}`;
    const step: DimeoAuthoredStep = {
      stepNumber,
      title,
      instruction: this.standardizeInstructionSentence(clean, this.language),
      warningText: parsed.warningText,
      extractedTorqueNm: parsed.torqueNm,
      extractedToleranceLabel: parsed.toleranceLabel,
      markerType: params.markerType,
      worldPosition: [
        round3(params.worldPosition[0]),
        round3(params.worldPosition[1]),
        round3(params.worldPosition[2]),
      ],
      snapshotDataUrl: params.snapshotDataUrl ?? '',
      qcm: this.buildDefaultQcmForText(title, this.language),
    };
    this.recordedDraftSteps = [...this.recordedDraftSteps, step];
    return {ok: true, step};
  }

  publishRecordedModule(moduleTitle?: string): {
    ok: boolean;
    error?: string;
    stepCount: number;
  } {
    if (this.recordedDraftSteps.length === 0) {
      return {
        ok: false,
        error: 'Capture at least 1 field step before publishing a playable module.',
        stepCount: 0,
      };
    }
    this.fieldRecordingActive = false;
    this.customModuleTitle =
      (moduleTitle ?? '').trim().slice(0, 80) ||
      (this.language === 'fr'
        ? 'Module Terrain Capturé (Android XR)'
        : this.language === 'es'
          ? 'Módulo de Campo Capturado (Android XR)'
          : 'Field-Captured Know-How Module (Android XR)');
    this.customSteps = [...this.recordedDraftSteps];
    this.customModuleActive = true;
    this.activePillar = 'player';
    this.arIndicatorsEnabled = true;
    return {ok: true, stepCount: this.customSteps.length};
  }

  // =========================================================================
  // Pillar 3: Confidential On-Device AI Assistant (Structure, Reformulate, Translate)
  // =========================================================================
  structureRawProcedureWithAi(
    rawNotes: string,
    moduleTitle?: string,
  ): {ok: true; steps: readonly DimeoAuthoredStep[]} | {ok: false; error: string} {
    const trimmed = rawNotes.trim();
    if (trimmed.length < 10) {
      return {
        ok: false,
        error:
          'Enter raw technician notes (>= 10 characters) for on-device AI structuring.',
      };
    }

    const rawLines = trimmed
      .split(/\r?\n|(?=\b[1-6][.)]\s)/g)
      .map((s) => s.replace(/^\s*[-*•0-9.)]+\s*/, '').trim())
      .filter((s) => s.length >= 4)
      .slice(0, 6);

    if (rawLines.length === 0) {
      return {
        ok: false,
        error: 'Could not segment any valid operational steps from the notes.',
      };
    }

    const markerCycle: readonly DimeoMarkerType[] = [
      'circle_ring',
      'arrow',
      'poi_pin',
      'warning_cone',
    ];

    const built: DimeoAuthoredStep[] = rawLines.map((line, index) => {
      const stepNumber = index + 1;
      const metrics = this.extractStructuredMetricsFromSentence(line);
      const markerType = metrics.warningText
        ? index === 0
          ? 'circle_ring'
          : markerCycle[index % markerCycle.length]
        : markerCycle[index % markerCycle.length];

      // Distribute 3D spatial markers cleanly across the helicopter / workcell datum
      const angle = (index - (rawLines.length - 1) / 2) * 0.28;
      const worldX = round3(Math.sin(angle) * 0.34);
      const worldY = round3(1.22 + (index % 2) * 0.14);
      const worldZ = -1.42;

      return {
        stepNumber,
        title: metrics.shortTitle || `AI Step 0${stepNumber}`,
        instruction: this.standardizeInstructionSentence(line, this.language),
        warningText: metrics.warningText,
        extractedTorqueNm: metrics.torqueNm,
        extractedToleranceLabel: metrics.toleranceLabel,
        markerType,
        worldPosition: [worldX, worldY, worldZ],
        snapshotDataUrl: '',
        qcm: this.buildDefaultQcmForText(
          metrics.shortTitle || `Step 0${stepNumber}`,
          this.language,
        ),
      };
    });

    this.customModuleTitle =
      (moduleTitle ?? '').trim().slice(0, 80) ||
      (this.language === 'fr'
        ? 'Gamme Structurée par IA Locale'
        : this.language === 'es'
          ? 'Procedimiento Estructurado por IA Local'
          : 'AI-Structured AR Procedure');
    this.customSteps = built;
    this.customModuleActive = true;
    this.arIndicatorsEnabled = true;
    return {ok: true, steps: built};
  }

  reformulateTextWithAi(rawText: string, lang = this.language): string {
    const clean = rawText.trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    return this.standardizeInstructionSentence(clean, lang);
  }

  translateCustomStepsWithAi(targetLang: DimeoLanguage): void {
    this.language = targetLang;
    if (this.customSteps.length === 0) return;

    this.customSteps = this.customSteps.map((st) => {
      const translatedTitle = translateTechnicalPhrase(st.title, targetLang);
      const translatedInstruction = this.standardizeInstructionSentence(
        translateTechnicalPhrase(st.instruction, targetLang),
        targetLang,
      );
      const translatedWarn = st.warningText
        ? translateTechnicalPhrase(st.warningText, targetLang)
        : '';
      return {
        ...st,
        title: translatedTitle,
        instruction: translatedInstruction,
        warningText: translatedWarn,
        qcm: this.buildDefaultQcmForText(translatedTitle, targetLang),
      };
    });
  }

  // =========================================================================
  // Supervision CSV & Portable JSON Module Exports
  // =========================================================================
  exportSupervisionCsv(
    scenarioId: ScenarioId,
    workOrderId: string,
    nominativeOperatorName?: string | null,
  ): string {
    const operator = this.resolveEffectiveOperatorLabel(nominativeOperatorName);
    const total = this.isCustomModuleActive() ? this.customSteps.length : 6;
    const header =
      'WorkOrder,AccountMode,OperatorBadge,Language,StepNumber,Validated,QcmOutcome,PhotosCount,CommentsCount,LatestComment';
    const rows: string[] = [header];

    for (let s = 1; s <= total; s++) {
      const validated = this.isStepValidated(scenarioId, s);
      const qcm = this.getStepQcmAnswer(scenarioId, s) ?? 'unanswered';
      const stepPhotos = this.photos.filter((p) => p.stepNumber === s).length;
      const stepComments = this.comments.filter((c) => c.stepNumber === s);
      const latest = (stepComments[0]?.message ?? '').replace(/"/g, '""');
      rows.push(
        `"${workOrderId}","${this.accountMode}","${operator}","${this.language}",${s},${validated},"${qcm}",${stepPhotos},${stepComments.length},"${latest}"`,
      );
    }
    return rows.join('\n');
  }

  exportModulePackageJson(scenarioId: ScenarioId, workOrderId: string): string {
    const payload = {
      schema: 'innoteo.dimeo.androidxr.v1',
      exportedAtIso: new Date().toISOString(),
      platform: 'Android XR (Galaxy XR / XREAL Aura)',
      language: this.language,
      accountMode: this.accountMode,
      arIndicatorsEnabled: this.arIndicatorsEnabled,
      wayfindingEnabled: this.wayfindingEnabled,
      followHeadEnabled: this.followHeadEnabled,
      scenarioId,
      workOrderId,
      customModuleActive: this.isCustomModuleActive(),
      customModuleTitle: this.customModuleTitle,
      customSteps: this.customSteps,
      spatialMarkers: this.getMarkersForScenario(scenarioId),
      comments: this.comments,
      photoCount: this.photos.length,
    };
    return JSON.stringify(payload, null, 2);
  }

  private makeStepKey(scenarioId: ScenarioId, stepNumber: number): string {
    const scope = this.isCustomModuleActive() ? 'custom' : scenarioId;
    return `${scope}:${Math.max(1, Math.min(6, Math.round(stepNumber)))}`;
  }

  private extractStructuredMetricsFromSentence(line: string): {
    readonly shortTitle: string;
    readonly torqueNm: number;
    readonly toleranceLabel: string;
    readonly warningText: string;
  } {
    const torqueMatch = line.match(/(\d+(?:[.,]\d+)?)\s*(?:n[·.\s-]*m|nm)\b/i);
    const torqueNm = torqueMatch
      ? round2(Number(torqueMatch[1].replace(',', '.')))
      : 0;

    const tolMatch = line.match(
      /(\d+(?:[.,]\d+)?)\s*(?:mm|db)\b/i,
    );
    const toleranceLabel = tolMatch ? tolMatch[0] : 'Standard Visual';

    const warnMatch = line.match(
      /(?:\bwarning\b|\battention\b|\badvertencia\b|\batencion\b|\bcaution\b)\s*[:\-]?\s*([^.;)]+)/i,
    );
    const warningText = warnMatch
      ? `CAUTION: ${warnMatch[1].trim()}`
      : torqueNm > 0
        ? `Verify calibrated digital wrench preset (${torqueNm.toFixed(1)} N·m).`
        : '';

    const cleanWords = line
      .replace(/\(.*?\)/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(' ');
    const shortTitle =
      cleanWords.charAt(0).toUpperCase() + cleanWords.slice(1, 56);

    return {shortTitle, torqueNm, toleranceLabel, warningText};
  }

  private standardizeInstructionSentence(
    raw: string,
    lang: DimeoLanguage,
  ): string {
    const trimmed = raw
      .replace(/^\s*(?:step|etape|étape|paso)\s*\d+\s*[:.-]?\s*/i, '')
      .trim();
    const capitalized =
      trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    const withPeriod = /[.!?]$/.test(capitalized)
      ? capitalized
      : `${capitalized}.`;

    if (lang === 'fr') {
      return `[SOP RA] ${withPeriod}`;
    }
    if (lang === 'es') {
      return `[SOP RA] ${withPeriod}`;
    }
    return `[AR SOP] ${withPeriod}`;
  }

  private buildDefaultQcmForText(
    stepTitle: string,
    lang: DimeoLanguage,
  ): DimeoStepQcmSpec {
    if (lang === 'fr') {
      return {
        question: `Contrôle terrain — ${stepTitle} :`,
        options: [
          {
            id: 'nominal',
            label: 'Conforme au référentiel RA',
            adaptiveGuidance:
              'QCM CONFORME : Étape validée, passer à l’opération suivante.',
            badgeText: 'QCM CONFORME',
          },
          {
            id: 'corrective_rework',
            label: 'Écart mineur — reprise immédiate',
            adaptiveGuidance:
              'BRANCHE REPRISE : Appliquer l’ajustement mécanique et recontrôler.',
            badgeText: 'BRANCHE : REPRISE',
          },
          {
            id: 'escalate_supervision',
            label: 'Non-conformité bloquante (Photo + FNC)',
            adaptiveGuidance:
              'ARRÊT SUPERVISION : Capturer une photo RA et notifier le chef d’équipe.',
            badgeText: 'ARRÊT : FNC',
          },
        ],
      };
    }
    if (lang === 'es') {
      return {
        question: `Control en campo — ${stepTitle}:`,
        options: [
          {
            id: 'nominal',
            label: 'Conforme con guía RA',
            adaptiveGuidance:
              'QCM OK: Paso validado, avanzar a la siguiente operación.',
            badgeText: 'QCM NOMINAL',
          },
          {
            id: 'corrective_rework',
            label: 'Desviación menor — ajuste inmediato',
            adaptiveGuidance:
              'RAMA RETRABAJO: Ejecutar ajuste correctivo y reverificar.',
            badgeText: 'RAMA: AJUSTE',
          },
          {
            id: 'escalate_supervision',
            label: 'No conformidad crítica (Foto + NCR)',
            adaptiveGuidance:
              'PARADA SUPERVISIÓN: Tomar foto RA y registrar comentario.',
            badgeText: 'PARADA: NCR',
          },
        ],
      };
    }
    return {
      question: `Field verification — ${stepTitle}:`,
      options: [
        {
          id: 'nominal',
          label: 'Conforms to AR datum & spec',
          adaptiveGuidance:
            'QCM OK: Step verified compliant; advance to next stage.',
          badgeText: 'QCM NOMINAL',
        },
        {
          id: 'corrective_rework',
          label: 'Minor deviation — apply field adjustment',
          adaptiveGuidance:
            'BRANCH REWORK: Re-seat fastener/shim and re-verify alignment.',
          badgeText: 'BRANCH: ADJUST',
        },
        {
          id: 'escalate_supervision',
          label: 'Blocking anomaly (AR Photo + Escalation)',
          adaptiveGuidance:
            'SUPERVISION HOLD: Capture 3D AR photo evidence and log an Anomaly.',
          badgeText: 'HOLD: ESCALATE',
        },
      ],
    };
  }
}

function translateTechnicalPhrase(
  input: string,
  targetLang: DimeoLanguage,
): string {
  const clean = input.replace(/^\[(?:AR SOP|SOP RA)\]\s*/i, '');
  const dictionary: ReadonlyArray<{
    readonly en: string;
    readonly fr: string;
    readonly es: string;
  }> = [
    {en: 'Degrease', fr: 'Dégraisser', es: 'Desengrasar'},
    {en: 'helicopter mast collar', fr: 'collerette mât hélicoptère', es: 'collarín del mástil'},
    {en: 'inspect bearing seal', fr: 'contrôler le joint palier', es: 'inspeccionar sello'},
    {en: 'Position titanium', fr: 'Positionner titane', es: 'Colocar titanio'},
    {en: 'bolt', fr: 'boulon', es: 'perno'},
    {en: 'Lock castellated nut', fr: 'Freiner écrou crénelé', es: 'Asegurar tuerca almenada'},
    {en: 'safety wire', fr: 'fil frein', es: 'alambre de seguridad'},
    {en: 'CAUTION:', fr: 'ATTENTION :', es: 'ADVERTENCIA:'},
  ];

  let out = clean;
  for (const entry of dictionary) {
    const target = entry[targetLang];
    for (const src of [entry.en, entry.fr, entry.es]) {
      if (src !== target) {
        out = out.replace(new RegExp(escapeRegExp(src), 'gi'), target);
      }
    }
  }
  return out;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
