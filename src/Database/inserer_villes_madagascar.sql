-- Ajoute les régions et les villes/localités visibles dans la liste fournie.
-- Les noms de régions suivent les libellés de la liste source.
-- Le script peut être rejoué : il ne duplique pas les régions ni les villes
-- déjà présentes et ne modifie pas les rattachements existants.

START TRANSACTION;

INSERT INTO regions (nom_region)
SELECT source.nom_region
FROM (
  SELECT 'Alaotra-Mangoro' AS nom_region
  UNION ALL SELECT 'Amoroni Mania'
  UNION ALL SELECT 'Analamanga'
  UNION ALL SELECT 'Analanjirofo'
  UNION ALL SELECT 'Androy'
  UNION ALL SELECT 'Anosy'
  UNION ALL SELECT 'Atsimo-Andrefana'
  UNION ALL SELECT 'Atsimo-Atsinanana'
  UNION ALL SELECT 'Atsinanana'
  UNION ALL SELECT 'Betsiboka'
  UNION ALL SELECT 'Boeny'
  UNION ALL SELECT 'Bongolava'
  UNION ALL SELECT 'Diana'
  UNION ALL SELECT 'Haute Matsiatra'
  UNION ALL SELECT 'Ihorombe'
  UNION ALL SELECT 'Itasy'
  UNION ALL SELECT 'Melaky'
  UNION ALL SELECT 'Menabe'
  UNION ALL SELECT 'Sava'
  UNION ALL SELECT 'Sofia'
  UNION ALL SELECT 'Vakinankaratra'
  UNION ALL SELECT 'Vatovavy-Fitovinany'
) AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM regions existing
  WHERE existing.nom_region = source.nom_region
);

INSERT INTO villes (nom_ville, id_region)
SELECT source.nom_ville, regions.id_region
FROM (
  SELECT 'Ambalavao' AS nom_ville, 'Haute Matsiatra' AS nom_region
  UNION ALL SELECT 'Ambanja', 'Diana'
  UNION ALL SELECT 'Ambatoboeny', 'Boeny'
  UNION ALL SELECT 'Ambatofinandrahana', 'Amoroni Mania'
  UNION ALL SELECT 'Ambatolampy', 'Vakinankaratra'
  UNION ALL SELECT 'Ambatondrazaka', 'Alaotra-Mangoro'
  UNION ALL SELECT 'Ambilobe', 'Diana'
  UNION ALL SELECT 'Amboasary', 'Anosy'
  UNION ALL SELECT 'Ambodifototra', 'Analanjirofo'
  UNION ALL SELECT 'Ambohidratrimo', 'Analamanga'
  UNION ALL SELECT 'Ambohimahasoa', 'Haute Matsiatra'
  UNION ALL SELECT 'Ambositra', 'Amoroni Mania'
  UNION ALL SELECT 'Ambovombe', 'Androy'
  UNION ALL SELECT 'Ampanihy', 'Atsimo-Andrefana'
  UNION ALL SELECT 'Amparafaravola', 'Alaotra-Mangoro'
  UNION ALL SELECT 'Analalava', 'Sofia'
  UNION ALL SELECT 'Andapa', 'Sava'
  UNION ALL SELECT 'Andilamena', 'Alaotra-Mangoro'
  UNION ALL SELECT 'Andoany', 'Diana'
  UNION ALL SELECT 'Anjozorobe', 'Analamanga'
  UNION ALL SELECT 'Ankazobe', 'Analamanga'
  UNION ALL SELECT 'Antalaha', 'Sava'
  UNION ALL SELECT 'Antananarivo', 'Analamanga'
  UNION ALL SELECT 'Antsirabe', 'Vakinankaratra'
  UNION ALL SELECT 'Antsiranana', 'Diana'
  UNION ALL SELECT 'Antsohihy', 'Sofia'
  UNION ALL SELECT 'Arivonimamo', 'Itasy'
  UNION ALL SELECT 'Bealanana', 'Sofia'
  UNION ALL SELECT 'Befandriana-Avaratra', 'Sofia'
  UNION ALL SELECT 'Besalampy', 'Melaky'
  UNION ALL SELECT 'Betafo', 'Vakinankaratra'
  UNION ALL SELECT 'Betioky', 'Atsimo-Andrefana'
  UNION ALL SELECT 'Betroka', 'Anosy'
  UNION ALL SELECT 'Boriziny', 'Sofia'
  UNION ALL SELECT 'Brickaville', 'Atsinanana'
  UNION ALL SELECT 'Fandriana', 'Amoroni Mania'
  UNION ALL SELECT 'Farafangana', 'Atsimo-Atsinanana'
  UNION ALL SELECT 'Fenoarivo Atsinanana', 'Analanjirofo'
  UNION ALL SELECT 'Fianarantsoa', 'Haute Matsiatra'
  UNION ALL SELECT 'Ifanadiana', 'Vatovavy-Fitovinany'
  UNION ALL SELECT 'Ihosy', 'Ihorombe'
  UNION ALL SELECT 'Ikongo', 'Vatovavy-Fitovinany'
  UNION ALL SELECT 'Imerintsiatosika', 'Itasy'
  UNION ALL SELECT 'Maevatanana', 'Betsiboka'
  UNION ALL SELECT 'Mahabo', 'Menabe'
  UNION ALL SELECT 'Mahajanga', 'Boeny'
  UNION ALL SELECT 'Mahanoro', 'Atsinanana'
  UNION ALL SELECT 'Maintirano', 'Melaky'
  UNION ALL SELECT 'Mampikony', 'Sofia'
  UNION ALL SELECT 'Manakara', 'Vatovavy-Fitovinany'
  UNION ALL SELECT 'Mananara Avaratra', 'Analanjirofo'
  UNION ALL SELECT 'Mananjary', 'Vatovavy-Fitovinany'
  UNION ALL SELECT 'Mandritsara', 'Sofia'
  UNION ALL SELECT 'Manja', 'Menabe'
  UNION ALL SELECT 'Manjakandriana', 'Analamanga'
  UNION ALL SELECT 'Maroantsetra', 'Analanjirofo'
  UNION ALL SELECT 'Marovoay', 'Boeny'
  UNION ALL SELECT 'Miandrivazo', 'Menabe'
  UNION ALL SELECT 'Miarinarivo', 'Itasy'
  UNION ALL SELECT 'Morafeno Bekily', 'Androy'
  UNION ALL SELECT 'Moramanga', 'Alaotra-Mangoro'
  UNION ALL SELECT 'Morombe', 'Atsimo-Andrefana'
  UNION ALL SELECT 'Morondava', 'Menabe'
  UNION ALL SELECT 'Sambava', 'Sava'
  UNION ALL SELECT 'Soalala', 'Boeny'
  UNION ALL SELECT 'Soavinandriana', 'Itasy'
  UNION ALL SELECT 'Taolagnaro', 'Anosy'
  UNION ALL SELECT 'Toamasina', 'Atsinanana'
  UNION ALL SELECT 'Tsaratanana', 'Betsiboka'
  UNION ALL SELECT 'Tsiroanomandidy', 'Bongolava'
  UNION ALL SELECT 'Vangaindrano', 'Atsimo-Atsinanana'
  UNION ALL SELECT 'Vatomandry', 'Atsinanana'
  UNION ALL SELECT 'Vavatenina', 'Analanjirofo'
  UNION ALL SELECT 'Vohemar', 'Sava'
  UNION ALL SELECT 'Vohipeno', 'Vatovavy-Fitovinany'
) AS source
JOIN regions
  ON regions.nom_region = source.nom_region
WHERE NOT EXISTS (
  SELECT 1
  FROM villes existing
  WHERE existing.nom_ville = source.nom_ville
);

COMMIT;

-- Contrôle : affiche les villes concernées, triées par région et par nom.
SELECT villes.nom_ville, regions.nom_region
FROM villes
JOIN regions ON regions.id_region = villes.id_region
WHERE villes.nom_ville IN (
  'Ambalavao', 'Ambanja', 'Ambatoboeny', 'Ambatofinandrahana',
  'Ambatolampy', 'Ambatondrazaka', 'Ambilobe', 'Amboasary',
  'Ambodifototra', 'Ambohidratrimo', 'Ambohimahasoa', 'Ambositra',
  'Ambovombe', 'Ampanihy', 'Amparafaravola', 'Analalava', 'Andapa',
  'Andilamena', 'Andoany', 'Anjozorobe', 'Ankazobe', 'Antalaha',
  'Antananarivo', 'Antsirabe', 'Antsiranana', 'Antsohihy',
  'Arivonimamo', 'Bealanana', 'Befandriana-Avaratra', 'Besalampy',
  'Betafo', 'Betioky', 'Betroka', 'Boriziny', 'Brickaville',
  'Fandriana', 'Farafangana', 'Fenoarivo Atsinanana', 'Fianarantsoa',
  'Ifanadiana', 'Ihosy', 'Ikongo', 'Imerintsiatosika', 'Maevatanana',
  'Mahabo', 'Mahajanga', 'Mahanoro', 'Maintirano', 'Mampikony',
  'Manakara', 'Mananara Avaratra', 'Mananjary', 'Mandritsara', 'Manja',
  'Manjakandriana', 'Maroantsetra', 'Marovoay', 'Miandrivazo',
  'Miarinarivo', 'Morafeno Bekily', 'Moramanga', 'Morombe', 'Morondava',
  'Sambava', 'Soalala', 'Soavinandriana', 'Taolagnaro', 'Toamasina',
  'Tsaratanana', 'Tsiroanomandidy', 'Vangaindrano', 'Vatomandry',
  'Vavatenina', 'Vohemar', 'Vohipeno'
)
ORDER BY regions.nom_region, villes.nom_ville;
