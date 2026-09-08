# F191 — Sponsorindslag

> Christian, 8. september 2026: *«Reklamer - A word from our sponsor agtigt - det
> skal vi kune indsætte i processen så en kunde reelt set kan bruge en podcast til
> monetization … Lav CMS tools til dette så den enkelte kunde kan have et arkiv af
> sponsorerede beskeder der kan genbruges og stitches ind i afsnittet bestemte
> steder … vi skal også have Aidan til at sige en standard besked.»*

## Hvorfor et ARKIV og ikke et felt på afsnittet

En sponsor køber sjældent ét afsnit. Hænger reklamen på afsnittet, skal den samme
lydfil uploades tolv gange, og ingen kan svare på **hvilke afsnit en sponsor
faktisk optræder i** — hvilket er det første en sponsor spørger om, og det eneste
spørgsmål der gør funktionen til monetization frem for til en lydfil.

Så indslaget er et **dokument** i en samling, og afsnittet peger på det.

## Målt før noget blev valgt

| | |
|---|---|
| Vores egen lyd | mp3, 44.100 Hz, mono, 128 kbit/s CBR — ens på alle filer |
| Naiv `cat a.mp3 b.mp3` | **BRUDT**: «Header missing · Invalid data found» |
| … men varigheden | 366,76 s mod forventet 366,64 — **ser rigtig ud** |
| ffmpeg i prod-imaget | **findes ikke** |

Den anden og tredje række sammen er hele grunden til at F191.3 findes.

**Jeg troede først den naive metode virkede**, fordi jeg målte varigheden.
`ffprobe` gætter varigheden ud fra filstørrelsen når strømmen er brudt, så det tal
er lige så grønt på en ødelagt fil som på en hel. Beviset er en fuld afkodning
(`ffmpeg -i fil -f null -`), ikke et varighedsfelt.

**En uploadet fil er ikke vores format.** Kunden får sin reklame fra et bureau:
stereo, 48 kHz, VBR, m4a. Uden normalisering er sammenføjningen kun korrekt for de
indslag vi selv genererer — altså præcis ikke det der blev bedt om.

## Stories

| | |
|---|---|
| **F191.1** | Sponsor-arkivet: en samling pr. site, genbrugelig på tværs af afsnit |
| **F191.2** | Aidans overgang — den faste sætning, genereret én gang og genbrugt |
| **F191.3** | Sammenføjningen: én fil ud, uanset hvad der blev uploadet |
| **F191.4** | Skærmen: vælg sponsor og placering på et afsnit |
| **F191.5** | Demo-reklamen for broberg.ai, dansk mandsstemme, ikke Aidans |

## Non-goals

- Ingen salgsstyring: hvem der skylder hvad, fakturering, kampagneperioder.
  Arkivet siger hvilke afsnit et indslag er brugt i; resten er en anden feature.
- Ingen dynamisk indsættelse ved afspilning (server-side ad insertion). Vi syr
  ÉN fil, fordi et RSS-feed distribuerer én fil.
- Ingen måling af hvor mange der hørte reklamen.
