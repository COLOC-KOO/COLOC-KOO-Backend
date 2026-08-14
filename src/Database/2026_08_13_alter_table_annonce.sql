ALTER TABLE depot_annonce 
ADD COLUMN internet ENUM('ADSL','Fibre','Box','Aucune') NULL, 
ADD COLUMN parking_voitures INT DEFAULT 0, 
ADD COLUMN parking_motos INT DEFAULT 0,  
ADD COLUMN parking_couvert TINYINT(1) DEFAULT 0; 