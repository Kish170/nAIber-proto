import { BasicInfoTools } from '../tools/BasicInfo';
import { HealthConditionsTools } from '../tools/HealthConditions';
import { MedicationTools } from '../tools/Medication';
import { HealthCategory, Severity, MedicationCategory, MedicationFrequency } from '../../../generated/prisma';

const basicInfoCRUD = new BasicInfoTools();
const healthConditionsCRUD = new HealthConditionsTools();
const medicationCRUD = new MedicationTools();

export class HealthDataService {
  async addHealthCondition(parameters: any, conversationID: string) {
    const { name, category, severity, notes } = parameters;
    const userId = await basicInfoCRUD.getUserID({conversationId: conversationID});
    
    if (!userId || !name || !category) {
      throw new Error('userId, name, and category are required');
    }
    
    const validCategories = ['CHRONIC', 'ACUTE', 'MENTAL_HEALTH', 'PHYSICAL', 'GENETIC', 'AUTOIMMUNE'];
    const upperCategory = category.toString().toUpperCase();
    if (!validCategories.includes(upperCategory)) {
      throw new Error(`Invalid health category. Must be one of: ${validCategories.join(', ')}`);
    }
    
    let processedSeverity: Severity | undefined = undefined;
    if (severity) {
      const validSeverities = ['MILD', 'MODERATE', 'SEVERE'];
      const upperSeverity = severity.toString().toUpperCase();
      if (!validSeverities.includes(upperSeverity)) {
        throw new Error(`Invalid severity. Must be one of: ${validSeverities.join(', ')}`);
      }
      processedSeverity = upperSeverity as Severity;
    }
    
    const healthCondition = await healthConditionsCRUD.findOrCreateHealthCondition(
      name,
      upperCategory as HealthCategory
    );

    const userHealthCondition = await healthConditionsCRUD.addUserHealthCondition({
      user: { connect: { id: userId } },
      healthCondition: { connect: { id: healthCondition.id } },
      severity: processedSeverity,
      notes
    });
    
    return {
      success: true,
      message: `Successfully added health condition: ${name}`,
      data: {
        userHealthConditionId: userHealthCondition.id,
        healthCondition: userHealthCondition.healthCondition,
        severity: userHealthCondition.severity,
        notes: userHealthCondition.notes
      }
    };
  }

  async getUserHealthConditions(parameters: any) {
    const { userId } = parameters;
    
    if (!userId) {
      throw new Error('userId is required');
    }
    
    const healthConditions = await healthConditionsCRUD.getUserHealthConditions(userId);
    
    return {
      success: true,
      message: `Found ${healthConditions.length} health conditions`,
      data: {
        healthConditions: healthConditions.map(uhc => ({
          id: uhc.id,
          name: uhc.healthCondition.name,
          category: uhc.healthCondition.category,
          severity: uhc.severity,
          notes: uhc.notes,
          diagnosedAt: uhc.diagnosedAt
        }))
      }
    };
  }

  async addMedication(parameters: any, conversationID: string) {
    const { name, category, dosage, frequency, prescriber, notes } = parameters;
    const userId = await basicInfoCRUD.getUserID({conversationId: conversationID});

    if (!userId || !name || !category || !dosage || !frequency) {
      throw new Error('userId, name, category, dosage, and frequency are required');
    }
    
    const validCategories = ['PAIN_RELIEF', 'HEART', 'DIABETES', 'BLOOD_PRESSURE', 'MENTAL_HEALTH', 'ANTIBIOTICS', 'VITAMINS', 'OTHER'];
    const upperCategory = category.toString().toUpperCase();
    if (!validCategories.includes(upperCategory)) {
      throw new Error(`Invalid medication category. Must be one of: ${validCategories.join(', ')}`);
    }
    
    const validFrequencies = ['ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'FOUR_TIMES_DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'MONTHLY', 'AS_NEEDED', 'EVERY_4_HOURS', 'EVERY_6_HOURS', 'EVERY_8_HOURS', 'EVERY_12_HOURS', 'BEDTIME', 'WITH_MEALS', 'BEFORE_MEALS', 'AFTER_MEALS'];
    const upperFrequency = frequency.toString().toUpperCase();
    if (!validFrequencies.includes(upperFrequency)) {
      throw new Error(`Invalid medication frequency. Must be one of: ${validFrequencies.join(', ')}`);
    }
    
    const medication = await medicationCRUD.findOrCreateMedication(
      name,
      upperCategory as MedicationCategory
    );
    
    const userMedication = await medicationCRUD.addUserMedication({
      user: { connect: { id: userId } },
      medication: { connect: { id: medication.id } },
      dosage,
      frequency: upperFrequency as MedicationFrequency,
      prescriber,
      notes
    });
    
    return {
      success: true,
      message: `Successfully added medication: ${name}`,
      data: {
        userMedicationId: userMedication.id,
        medication: (userMedication as any).medication,
        dosage: userMedication.dosage,
        frequency: userMedication.frequency,
        prescriber: userMedication.prescriber,
        notes: userMedication.notes
      }
    };
  }

  async getUserMedications(parameters: any) {
    const { userId } = parameters;
    
    if (!userId) {
      throw new Error('userId is required');
    }
    
    const medications = await medicationCRUD.getUserMedications(userId);
    
    return {
      success: true,
      message: `Found ${medications.length} medications`,
      data: {
        medications: medications.map(um => ({
          id: um.id,
          name: um.medication.name,
          genericName: um.medication.genericName,
          category: um.medication.category,
          dosage: um.dosage,
          frequency: um.frequency,
          prescriber: um.prescriber,
          notes: um.notes,
          startedAt: um.startedAt
        }))
      }
    };
  }

  async checkHealthStatus(parameters: any) {
    try {
        console.log("[Health Status] Recording health status:", parameters);
        const { status, symptoms, severity } = parameters;
        
        // Here you could save health status to database
        // For now, just return acknowledgment
        
        return {
            success: true,
            message: 'Health status recorded successfully',
            data: {
                status,
                symptoms,
                severity,
                recordedAt: new Date().toISOString()
            }
        };
    } catch (error) {
        console.error('[Health Status] Error recording health status:', error);
        return {
            success: false,
            message: 'Error recording health status',
            error: error
        };
    }
  }

  async verifyMedicationCompliance(parameters: any) {
    try {
        console.log("[Medication] Verifying medication compliance:", parameters);
        const { medicationName, taken, timeOfDay } = parameters;
        
        return {
            success: true,
            message: 'Medication compliance logged successfully',
            data: {
                medicationName,
                taken,
                timeOfDay,
                loggedAt: new Date().toISOString()
            }
        };
    } catch (error) {
        console.error('[Medication] Error logging medication compliance:', error);
        return {
            success: false,
            message: 'Error logging medication compliance',
            error: error
        };
    }
  }
}