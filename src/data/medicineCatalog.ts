/**
 * Curated starter Medicine Database of popular medicines and OTC products
 * from major pharmaceutical companies in India.
 *
 * This is a seed library meant to kick-start the inventory. It can be
 * expanded by dropping a full dataset (e.g. 4.5L+ medicine JSON/CSV) into
 * this file or by importing from a third-party medicine database API.
 *
 * Fields map onto the `medicines` table: name (trade name), company is
 * stored as `brand` on import, composition, category (form), unit, HSN
 * code and GST rate. GST rates are indicative — verify per item and edit
 * freely in inventory.
 */

export interface MedicineCatalogEntry {
  name: string;
  company: string;
  composition: string;
  category: string;
  unit: string;
  packSize: string;
  hsnCode: string;
  gstRate: 0 | 5 | 12 | 18 | 28;
}

export const MEDICINE_CATALOG: MedicineCatalogEntry[] = [
  // ---------- Analgesics & Fever ----------
  { name: "Calpol 650", company: "GSK", composition: "Paracetamol 650mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Dolo 650", company: "Micro Labs", composition: "Paracetamol 650mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Crocin 650", company: "GSK", composition: "Paracetamol 650mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Combiflam", company: "Sanofi", composition: "Ibuprofen 400mg + Paracetamol 325mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Nise 100", company: "Dr. Reddy's", composition: "Nimesulide 100mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Zerodol", company: "Ipca", composition: "Aceclofenac 100mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Emanzen-D", company: "Zydus", composition: "Aceclofenac 100mg + Paracetamol 325mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Sumo", company: "Alkem", composition: "Aceclofenac 100mg + Paracetamol 325mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Voveran 50", company: "Zydus", composition: "Diclofenac 50mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Meftal", company: "Blue Cross", composition: "Mefenamic Acid 250mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Flexon", company: "Blue Cross", composition: "Paracetamol 450mg + Chlorzoxazone 250mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Saridon", company: "Piramal", composition: "Paracetamol 250mg + Propyphenazone 150mg + Caffeine 50mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Spasmo Proxyvon Plus", company: "Dr. Reddy's", composition: "Paracetamol 325mg + Dicyclomine 20mg", category: "Capsule", unit: "Strip", packSize: "10 caps", hsnCode: "30049099", gstRate: 5 },
  { name: "Volini Gel", company: "Sun Pharma", composition: "Diclofenac 1% w/w", category: "Gel", unit: "Tube", packSize: "30 g", hsnCode: "30049099", gstRate: 5 },

  // ---------- Antibiotics ----------
  { name: "Augmentin 625 Duo", company: "GSK", composition: "Amoxicillin 500mg + Clavulanic Acid 125mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Clavam 625", company: "Alkem", composition: "Amoxicillin 500mg + Clavulanic Acid 125mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Mox 500", company: "Sun Pharma", composition: "Amoxicillin 500mg", category: "Capsule", unit: "Strip", packSize: "10 caps", hsnCode: "30049099", gstRate: 5 },
  { name: "Amoxil 500", company: "GSK", composition: "Amoxicillin 500mg", category: "Capsule", unit: "Strip", packSize: "10 caps", hsnCode: "30049099", gstRate: 5 },
  { name: "Ciplox 500", company: "Cipla", composition: "Ciprofloxacin 500mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Cifran 500", company: "Ranbaxy", composition: "Ciprofloxacin 500mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Azithral 500", company: "Alembic", composition: "Azithromycin 500mg", category: "Tablet", unit: "Strip", packSize: "5 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Azee 500", company: "Cipla", composition: "Azithromycin 500mg", category: "Tablet", unit: "Strip", packSize: "5 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Zifi 200", company: "Sun Pharma", composition: "Cefixime 200mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Taxim-O 200", company: "Alkem", composition: "Cefixime 200mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Ceftum 500", company: "GSK", composition: "Cefuroxime 500mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Cepodem 200", company: "Cipla", composition: "Cefpodoxime 200mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Norflox-TZ", company: "Cipla", composition: "Norfloxacin 400mg + Tinidazole 600mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Flagyl 400", company: "Abbott", composition: "Metronidazole 400mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },

  // ---------- Gastro & Digestion ----------
  { name: "Pan 40", company: "Alkem", composition: "Pantoprazole 40mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Pantocid 40", company: "Sun Pharma", composition: "Pantoprazole 40mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Pan-D", company: "Alkem", composition: "Pantoprazole 40mg + Domperidone 30mg", category: "Capsule", unit: "Strip", packSize: "10 caps", hsnCode: "30049099", gstRate: 5 },
  { name: "Omez 20", company: "Dr. Reddy's", composition: "Omeprazole 20mg", category: "Capsule", unit: "Strip", packSize: "15 caps", hsnCode: "30049099", gstRate: 5 },
  { name: "Razo 20", company: "Dr. Reddy's", composition: "Rabeprazole 20mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Zinetac 150", company: "GSK", composition: "Ranitidine 150mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Rantac 150", company: "JB Chemicals", composition: "Ranitidine 150mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Digene", company: "Abbott", composition: "Magaldrate + Simethicone", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Gelusil", company: "Pfizer", composition: "Magnesium + Aluminium Hydroxide", category: "Syrup", unit: "Bottle", packSize: "200 ml", hsnCode: "30049099", gstRate: 5 },
  { name: "Cremaffin", company: "Abbott", composition: "Lactulose 10g/15ml", category: "Syrup", unit: "Bottle", packSize: "200 ml", hsnCode: "30049099", gstRate: 5 },
  { name: "Duphalac", company: "Abbott", composition: "Lactulose", category: "Syrup", unit: "Bottle", packSize: "200 ml", hsnCode: "30049099", gstRate: 5 },
  { name: "Eno", company: "GSK", composition: "Sodium Bicarbonate + Citric Acid", category: "Powder", unit: "Sachet", packSize: "10 sachets", hsnCode: "30049099", gstRate: 5 },
  { name: "Pudin Hara", company: "Piramal", composition: "Peppermint Oil", category: "Liquid", unit: "Bottle", packSize: "75 ml", hsnCode: "30049099", gstRate: 5 },
  { name: "Normaxin", company: "Abbott", composition: "Probiotic + Vitamins", category: "Capsule", unit: "Strip", packSize: "10 caps", hsnCode: "30049099", gstRate: 12 },
  { name: "Enterogermina", company: "Sanofi", composition: "Bacillus clausii Probiotic", category: "Liquid", unit: "Bottle", packSize: "5 ml × 10", hsnCode: "30049099", gstRate: 5 },

  // ---------- Cardiac ----------
  { name: "Atorva 10", company: "Zydus", composition: "Atorvastatin 10mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Atorlip-10", company: "Cipla", composition: "Atorvastatin 10mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Rosuvas 10", company: "Intas", composition: "Rosuvastatin 10mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Stamlo 5", company: "Dr. Reddy's", composition: "Amlodipine 5mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Amlong 5", company: "Micro Labs", composition: "Amlodipine 5mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Telma 40", company: "Glenmark", composition: "Telmisartan 40mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Cilacar 10", company: "Sun Pharma", composition: "Cilnidipine 10mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Cardace 5", company: "Sanofi", composition: "Ramipril 5mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Envas 5", company: "Torrent", composition: "Enalapril 5mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Met XL 50", company: "Zydus", composition: "Metoprolol Succinate 50mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Nebicard 5", company: "Intas", composition: "Nebivolol 5mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Ecosprin 75", company: "USV", composition: "Aspirin 75mg", category: "Tablet", unit: "Strip", packSize: "14 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Clopitab 75", company: "Sun Pharma", composition: "Clopidogrel 75mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },

  // ---------- Diabetes ----------
  { name: "Glycomet 500", company: "USV", composition: "Metformin 500mg", category: "Tablet", unit: "Strip", packSize: "20 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Glycomet-GP 2", company: "USV", composition: "Metformin 500mg + Glimepiride 2mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Glykind-M 500", company: "Mankind", composition: "Metformin 500mg + Sitagliptin 50mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Januvia 100", company: "MSD", composition: "Sitagliptin 100mg", category: "Tablet", unit: "Strip", packSize: "14 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Galvus 50", company: "Novartis", composition: "Vildagliptin 50mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Trajenta 5", company: "Boehringer", composition: "Linagliptin 5mg", category: "Tablet", unit: "Strip", packSize: "30 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Glucobay 50", company: "Bayer", composition: "Acarbose 50mg", category: "Tablet", unit: "Strip", packSize: "30 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Novomix 30", company: "Novo Nordisk", composition: "Insulin Aspart 30/70", category: "Injection", unit: "Vial", packSize: "100 IU / 10 ml", hsnCode: "30043110", gstRate: 5 },
  { name: "Lantus SoloStar", company: "Sanofi", composition: "Insulin Glargine", category: "Injection", unit: "Pen", packSize: "3 ml", hsnCode: "30043110", gstRate: 5 },
  { name: "Humalog", company: "Eli Lilly", composition: "Insulin Lispro", category: "Injection", unit: "Vial", packSize: "100 IU / 10 ml", hsnCode: "30043110", gstRate: 5 },

  // ---------- Respiratory ----------
  { name: "Asthalin 100", company: "Cipla", composition: "Salbutamol 100mcg", category: "Inhaler", unit: "Canister", packSize: "200 MDI", hsnCode: "30043919", gstRate: 5 },
  { name: "Foracort 200", company: "Cipla", composition: "Formoterol 6mcg + Budesonide 200mcg", category: "Inhaler", unit: "Canister", packSize: "120 MDI", hsnCode: "30043919", gstRate: 5 },
  { name: "Seroflo 250", company: "Cipla", composition: "Fluticasone 250mcg + Salmeterol 25mcg", category: "Inhaler", unit: "Canister", packSize: "120 MDI", hsnCode: "30043919", gstRate: 5 },
  { name: "Budecort 0.5", company: "Cipla", composition: "Budesonide 0.5mg", category: "Respules", unit: "Box", packSize: "5 × 2 ml", hsnCode: "30043919", gstRate: 5 },
  { name: "Montair 10", company: "Cipla", composition: "Montelukast 10mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Deriphyllin", company: "Zydus", composition: "Etofylline 77mg + Theophylline 23mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Otrivin", company: "GSK", composition: "Xylometazoline 0.1%", category: "Nasal Spray", unit: "Bottle", packSize: "10 ml", hsnCode: "30049099", gstRate: 5 },
  { name: "Ascoril LS", company: "Glenmark", composition: "Ambroxol + Levosalbutamol + Guaiphenesin", category: "Syrup", unit: "Bottle", packSize: "100 ml", hsnCode: "30049099", gstRate: 5 },

  // ---------- Cough & Cold ----------
  { name: "Corex", company: "Pfizer", composition: "Chlorpheniramine + Dextromethorphan + PPA", category: "Syrup", unit: "Bottle", packSize: "100 ml", hsnCode: "30049099", gstRate: 5 },
  { name: "Benadryl", company: "Pfizer", composition: "Diphenhydramine 14mg/5ml", category: "Syrup", unit: "Bottle", packSize: "100 ml", hsnCode: "30049099", gstRate: 5 },
  { name: "Phensedyl", company: "Abbott", composition: "Codeine 10mg + Chlorpheniramine 4mg", category: "Syrup", unit: "Bottle", packSize: "100 ml", hsnCode: "30049099", gstRate: 5 },
  { name: "Chericof", company: "Alkem", composition: "Dextromethorphan + Chlorpheniramine", category: "Syrup", unit: "Bottle", packSize: "100 ml", hsnCode: "30049099", gstRate: 5 },

  // ---------- Allergy ----------
  { name: "Allegra 120", company: "Sanofi", composition: "Fexofenadine 120mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Cetzine", company: "Glenmark", composition: "Cetirizine 10mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Histafree", company: "Micro Labs", composition: "Cetirizine 10mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Lorfast", company: "Micro Labs", composition: "Loratadine 10mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },

  // ---------- Vitamins & Supplements ----------
  { name: "Becosules", company: "Pfizer", composition: "B-Complex + Vitamin C", category: "Capsule", unit: "Strip", packSize: "20 caps", hsnCode: "30045010", gstRate: 12 },
  { name: "Supradyn", company: "Bayer", composition: "Multivitamin + Minerals", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30045010", gstRate: 12 },
  { name: "Shelcal 500", company: "Torrent", composition: "Calcium Carbonate 1250mg + Vit D3 250 IU", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30045010", gstRate: 12 },
  { name: "Uprise-D3", company: "Mankind", composition: "Cholecalciferol 60K IU", category: "Capsule", unit: "Strip", packSize: "4 caps", hsnCode: "30045010", gstRate: 12 },
  { name: "Evion 400", company: "Merck", composition: "Vitamin E 400mg", category: "Capsule", unit: "Strip", packSize: "10 caps", hsnCode: "30045010", gstRate: 12 },
  { name: "Folvite", company: "Pfizer", composition: "Folic Acid 5mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Rejunex", company: "Mankind", composition: "Multivitamin + Ginseng", category: "Capsule", unit: "Strip", packSize: "15 caps", hsnCode: "30045010", gstRate: 12 },
  { name: "Nurokind-Plus", company: "Mankind", composition: "Mecobalamin + Pyridoxine + Folic Acid", category: "Capsule", unit: "Strip", packSize: "30 caps", hsnCode: "30045010", gstRate: 12 },
  { name: "Astymin Forte", company: "Sun Pharma", composition: "Multivitamin + Minerals", category: "Capsule", unit: "Strip", packSize: "15 caps", hsnCode: "30045010", gstRate: 12 },

  // ---------- Neurology & Psychiatry ----------
  { name: "Alzolam 0.5", company: "Abbott", composition: "Alprazolam 0.5mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Tryptomer 10", company: "Abbott", composition: "Amitriptyline 10mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Oleanz 5", company: "Sun Pharma", composition: "Olanzapine 5mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Sez 20", company: "Intas", composition: "Escitalopram 20mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Nexito 10", company: "Intas", composition: "Escitalopram 10mg", category: "Tablet", unit: "Strip", packSize: "15 tabs", hsnCode: "30049099", gstRate: 5 },

  // ---------- Hormones & Women's Health ----------
  { name: "Thyronorm 50", company: "Abbott", composition: "Levothyroxine 50mcg", category: "Tablet", unit: "Strip", packSize: "100 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Duphaston 10", company: "Abbott", composition: "Dydrogesterone 10mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Letroz 2.5", company: "Dr. Reddy's", composition: "Letrozole 2.5mg", category: "Tablet", unit: "Strip", packSize: "10 tabs", hsnCode: "30049099", gstRate: 5 },
  { name: "Unwanted 72", company: "Mankind", composition: "Levonorgestrel 1.5mg", category: "Tablet", unit: "Strip", packSize: "1 tab", hsnCode: "30049099", gstRate: 5 },

  // ---------- Dermatology & Topicals ----------
  { name: "Betadine", company: "Win-Medicare", composition: "Povidone Iodine 5%", category: "Ointment", unit: "Tube", packSize: "20 g", hsnCode: "30049099", gstRate: 5 },
  { name: "T-Bact", company: "GSK", composition: "Mupirocin 2%", category: "Ointment", unit: "Tube", packSize: "5 g", hsnCode: "30049099", gstRate: 5 },
  { name: "Soframycin", company: "Sanofi", composition: "Framycetin 1%", category: "Ointment", unit: "Tube", packSize: "15 g", hsnCode: "30049099", gstRate: 5 },
  { name: "Clocip", company: "GSK", composition: "Clobetasol 0.05%", category: "Ointment", unit: "Tube", packSize: "15 g", hsnCode: "30049099", gstRate: 5 },
  { name: "Candid", company: "Glenmark", composition: "Clotrimazole 1%", category: "Cream", unit: "Tube", packSize: "15 g", hsnCode: "30049099", gstRate: 5 },
  { name: "Iodex", company: "GSK", composition: "Methyl Salicylate + Menthol", category: "Ointment", unit: "Tube", packSize: "25 g", hsnCode: "30049099", gstRate: 5 },
  { name: "Moov", company: "Reckitt", composition: "Methyl Salicylate + Menthol", category: "Spray", unit: "Can", packSize: "100 ml", hsnCode: "30049099", gstRate: 5 },

  // ---------- Eye Care ----------
  { name: "Refresh Tears", company: "Allergan", composition: "Carboxymethylcellulose 0.5%", category: "Eye Drops", unit: "Bottle", packSize: "15 ml", hsnCode: "30049099", gstRate: 5 },
  { name: "Ciloxan", company: "Alcon", composition: "Ciprofloxacin 0.3%", category: "Eye Drops", unit: "Bottle", packSize: "5 ml", hsnCode: "30049099", gstRate: 5 },

  // ---------- OTC & Antiseptics ----------
  { name: "Dettol", company: "Reckitt", composition: "Chloroxylenol 4.8%", category: "Antiseptic Liquid", unit: "Bottle", packSize: "250 ml", hsnCode: "38089400", gstRate: 18 },
  { name: "Savlon", company: "ITC", composition: "Cetrimide + Chlorhexidine", category: "Antiseptic Liquid", unit: "Bottle", packSize: "100 ml", hsnCode: "38089400", gstRate: 18 },
  { name: "Vicks VapoRub", company: "P&G", composition: "Menthol + Camphor + Eucalyptus Oil", category: "Ointment", unit: "Jar", packSize: "50 g", hsnCode: "33049990", gstRate: 18 },
  { name: "Strepsils", company: "Reckitt", composition: "Amylmetacresol + Dichlorobenzyl Alcohol", category: "Lozenges", unit: "Strip", packSize: "12 tabs", hsnCode: "30049099", gstRate: 12 },
  { name: "Burnol", company: "GSK", composition: "Acriflavine + Cetrimide", category: "Ointment", unit: "Tube", packSize: "20 g", hsnCode: "30049099", gstRate: 12 },
];
