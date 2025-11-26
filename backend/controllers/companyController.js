import { getHR201Pool } from '../config/hr201Database.js';
import sharp from 'sharp';

// Image processing functions
const processLogo = async (buffer) => {
  try {
    const processedBuffer = await sharp(buffer)
      .resize(200, 200, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toBuffer();
    
    // If still too large, reduce quality
    let quality = 90;
    let finalBuffer = processedBuffer;
    
    while (finalBuffer.length > 50 * 1024 && quality > 10) {
      finalBuffer = await sharp(buffer)
        .resize(200, 200, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png({ quality })
        .toBuffer();
      quality -= 10;
    }
    
    return finalBuffer;
  } catch (error) {
    console.error('Error processing logo:', error);
    throw error;
  }
};

const processESignature = async (buffer) => {
  try {
    const processedBuffer = await sharp(buffer)
      .resize(300, 200, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toBuffer();
    
    // If still too large, reduce quality
    let quality = 90;
    let finalBuffer = processedBuffer;
    
    while (finalBuffer.length > 100 * 1024 && quality > 10) {
      finalBuffer = await sharp(buffer)
        .resize(300, 200, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png({ quality })
        .toBuffer();
      quality -= 10;
    }
    
    return finalBuffer;
  } catch (error) {
    console.error('Error processing e-signature:', error);
    throw error;
  }
};

// GET /api/company/info - Get company information
export const getCompanyInfo = async (req, res) => {
  try {
    const hr201Pool = getHR201Pool();

    // Ensure table exists
    await hr201Pool.query(`
      CREATE TABLE IF NOT EXISTS companyinfo (
        lgusystemname TEXT NULL,
        lguname TEXT NULL,
        lgutype TEXT NULL,
        lguaddress TEXT NULL,
        lgucontact TEXT NULL,
        lguemail TEXT NULL,
        lgufburl TEXT NULL,
        lgumayor TEXT NULL,
        lgumayor_esig MEDIUMBLOB NULL,
        lguaccountant TEXT NULL,
        lguaccountant_esig MEDIUMBLOB NULL,
        lgutreasurer TEXT NULL,
        lgutreasurer_esig MEDIUMBLOB NULL,
        lgubursar TEXT NULL,
        lgubursar_esig MEDIUMBLOB NULL,
        lgulogo MEDIUMBLOB NULL,
        lgulogotag TEXT NULL,
        lguseqsignature TEXT NULL
      )
    `);

    const [rows] = await hr201Pool.query(`
      SELECT 
        lgusystemname AS lguDtrName,
        lguname AS lguName,
        lgutype AS lguType,
        lguaddress AS lguAddress,
        lgucontact AS lguContact,
        lguemail AS lguEmail,
        lgufburl AS lguFbUrl,
        lgumayor AS lguMayor,
        lguaccountant AS lguHrmo,
        lgutreasurer AS lguTreasurer,
        lgubursar AS lguBursar,
        lgulogo AS logo,
        lgumayor_esig AS mayorEsig,
        lguaccountant_esig AS hrmoEsig,
        lgutreasurer_esig AS treasurerEsig,
        lgubursar_esig AS bursarEsig
      FROM companyinfo
      LIMIT 1
    `);

    if (!rows || rows.length === 0) {
      return res.json({
        success: false,
        message: 'No company information found'
      });
    }

    const companyInfo = rows[0];

    const toBase64Preview = (buffer) => {
      if (!buffer) return null;
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      if (buf.length === 0) return null;
      return `data:image/png;base64,${buf.toString('base64')}`;
    };

    companyInfo.logoPreview = toBase64Preview(companyInfo.logo);
    companyInfo.mayorEsigPreview = toBase64Preview(companyInfo.mayorEsig);
    companyInfo.hrmoEsigPreview = toBase64Preview(companyInfo.hrmoEsig);
    companyInfo.treasurerEsigPreview = toBase64Preview(companyInfo.treasurerEsig);
    companyInfo.bursarEsigPreview = toBase64Preview(companyInfo.bursarEsig);

    delete companyInfo.logo;
    delete companyInfo.mayorEsig;
    delete companyInfo.hrmoEsig;
    delete companyInfo.treasurerEsig;
    delete companyInfo.bursarEsig;

    res.json({
      success: true,
      data: companyInfo
    });
  } catch (error) {
    console.error('Error fetching company info:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching company information',
      error: error.message
    });
  }
};

// PUT /api/company/info - Update company information with file uploads
export const updateCompanyInfo = async (req, res) => {
  try {
    const {
      lguDtrName,
      lguName,
      lguType,
      lguAddress,
      lguContact,
      lguEmail,
      lguFbUrl,
      lguMayor,
      lguHrmo,
      lguTreasurer,
      lguBursar
    } = req.body || {};

    if (!lguDtrName || !lguName || !lguType || !lguAddress) {
      return res.status(400).json({
        success: false,
        message: 'DTR Name, LGU Name, LGU Type, and Address are required'
      });
    }

    const hr201Pool = getHR201Pool();

    await hr201Pool.query(`
      CREATE TABLE IF NOT EXISTS companyinfo (
        lgusystemname TEXT NULL,
        lguname TEXT NULL,
        lgutype TEXT NULL,
        lguaddress TEXT NULL,
        lgucontact TEXT NULL,
        lguemail TEXT NULL,
        lgufburl TEXT NULL,
        lgumayor TEXT NULL,
        lgumayor_esig MEDIUMBLOB NULL,
        lguaccountant TEXT NULL,
        lguaccountant_esig MEDIUMBLOB NULL,
        lgutreasurer TEXT NULL,
        lgutreasurer_esig MEDIUMBLOB NULL,
        lgubursar TEXT NULL,
        lgubursar_esig MEDIUMBLOB NULL,
        lgulogo MEDIUMBLOB NULL,
        lgulogotag TEXT NULL,
        lguseqsignature TEXT NULL
      )
    `);

    const normalized = {
      lguDtrName: String(lguDtrName).trim(),
      lguName: String(lguName).trim(),
      lguType: String(lguType).trim(),
      lguAddress: String(lguAddress).trim(),
      lguContact: lguContact ? String(lguContact).trim() : '',
      lguEmail: lguEmail ? String(lguEmail).trim() : '',
      lguFbUrl: lguFbUrl ? String(lguFbUrl).trim() : '',
      lguMayor: lguMayor ? String(lguMayor).trim() : '',
      lguHrmo: lguHrmo ? String(lguHrmo).trim() : '',
      lguTreasurer: lguTreasurer ? String(lguTreasurer).trim() : '',
      lguBursar: lguBursar ? String(lguBursar).trim() : ''
    };

    const files = req.files || {};
    const blobs = {};

    const processOrThrow = async (label, processor, file) => {
      if (!file) return null;
      try {
        return await processor(file.buffer);
      } catch (err) {
        console.error(`Error processing ${label}:`, err);
        throw new Error(`Error processing ${label} image`);
      }
    };

    blobs.logo = await processOrThrow('logo', processLogo, files.logo?.[0]);
    blobs.mayorEsig = await processOrThrow('mayor e-signature', processESignature, files.mayorEsig?.[0]);
    blobs.hrmoEsig = await processOrThrow('HRMO e-signature', processESignature, files.hrmoEsig?.[0]);
    blobs.treasurerEsig = await processOrThrow('treasurer e-signature', processESignature, files.treasurerEsig?.[0]);
    blobs.bursarEsig = await processOrThrow('bursar e-signature', processESignature, files.bursarEsig?.[0]);

    await hr201Pool.query('DELETE FROM companyinfo');

    const columns = [
      'lgusystemname',
      'lguname',
      'lgutype',
      'lguaddress',
      'lgucontact',
      'lguemail',
      'lgufburl',
      'lgumayor',
      'lgumayor_esig',
      'lguaccountant',
      'lguaccountant_esig',
      'lgutreasurer',
      'lgutreasurer_esig',
      'lgubursar',
      'lgubursar_esig',
      'lgulogo'
    ];

    const values = [
      normalized.lguDtrName,
      normalized.lguName,
      normalized.lguType,
      normalized.lguAddress,
      normalized.lguContact,
      normalized.lguEmail,
      normalized.lguFbUrl,
      normalized.lguMayor,
      blobs.mayorEsig ?? null,
      normalized.lguHrmo,
      blobs.hrmoEsig ?? null,
      normalized.lguTreasurer,
      blobs.treasurerEsig ?? null,
      normalized.lguBursar,
      blobs.bursarEsig ?? null,
      blobs.logo ?? null
    ];

    const placeholders = columns.map(() => '?').join(',');
    await hr201Pool.query(
      `INSERT INTO companyinfo (${columns.join(',')}) VALUES (${placeholders})`,
      values
    );

    res.json({
      success: true,
      message: 'Company information updated successfully'
    });
  } catch (error) {
    console.error('Error updating company info:', error);
    const message =
      error instanceof Error ? error.message : 'Error updating company information';
    res.status(500).json({
      success: false,
      message,
      error: message
    });
  }
};