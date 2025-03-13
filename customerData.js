// customerData.js
const fs = require('fs');
const path = require('path');

class CustomerDataManager {
    constructor(storagePath = './data') {
        this.customerData = new Map();
        this.storagePath = storagePath;
        this.dataFilePath = path.join(this.storagePath, 'customer-data.json');
        
        // Contador para pedidos y reservas
        this.counters = {
            purchase: 1000,
            reservation: 1000
        };
        
        // Crear directorio de datos si no existe
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
        
        // Cargar datos si existen
        this.loadData();
        
        // Inicializar contadores basados en datos existentes
        this.initializeCounters();
        
        // Configurar guardado periódico
        this.setupPeriodicSave();
    }
    
    // Inicializar contadores basados en datos existentes
    initializeCounters() {
        // Encontrar el número de referencia más alto para cada tipo
        this.customerData.forEach((userData) => {
            if (userData.purchase && userData.purchase.data && userData.purchase.data.referenceNumber) {
                const refNum = parseInt(userData.purchase.data.referenceNumber.substring(1));
                this.counters.purchase = Math.max(this.counters.purchase, refNum);
            }
            
            if (userData.reservation && userData.reservation.data && userData.reservation.data.referenceNumber) {
                const refNum = parseInt(userData.reservation.data.referenceNumber.substring(1));
                this.counters.reservation = Math.max(this.counters.reservation, refNum);
            }
        });
    }
    
    // Inicializar datos del cliente para un tipo específico (purchase/reservation)
    initCustomerData(userId, type) {
        if (!this.customerData.has(userId)) {
            this.customerData.set(userId, {});
        }
        
        const userData = this.customerData.get(userId);
        if (!userData[type]) {
            userData[type] = {
                timestamp: new Date().toISOString(),
                data: {}
            };
        }
        return userData;
    }
    
    // Obtener datos de un cliente
    getCustomerData(userId) {
        return this.customerData.get(userId) || null;
    }
    
    // Guardar un campo específico para un cliente
    saveField(userId, type, field, value) {
        const userData = this.initCustomerData(userId, type);
        userData[type].data[field] = value;
        
        // Si es un registro nuevo, asignar número de referencia
        if (field === 'status' && value === 'pending' && !userData[type].data.referenceNumber) {
            userData[type].data.referenceNumber = this.generateReferenceNumber(type);
        }
        
        this.saveData();
        return userData;
    }
    
    // Actualizar estado de un registro
    updateStatus(userId, type, status) {
        const userData = this.initCustomerData(userId, type);
        userData[type].data.status = status;
        userData[type].data.confirmationTime = new Date().toISOString();
        
        // Si es un registro nuevo confirming, asignar número de referencia
        if (status === 'confirmed' && !userData[type].data.referenceNumber) {
            userData[type].data.referenceNumber = this.generateReferenceNumber(type);
        }
        
        this.saveData();
        return userData;
    }
    
    // Guardar datos en archivo
    saveData() {
        try {
            // Convertir Map a objeto para serialización
            const data = {};
            this.customerData.forEach((value, key) => {
                data[key] = value;
            });
            
            // Incluir contadores en los datos guardados
            data['_counters'] = this.counters;
            
            fs.writeFileSync(
                this.dataFilePath, 
                JSON.stringify(data, null, 2)
            );
            console.log('Datos de clientes guardados correctamente');
        } catch (error) {
            console.error('Error al guardar datos de clientes:', error);
        }
    }
    
    // Cargar datos desde archivo
    loadData() {
        try {
            if (fs.existsSync(this.dataFilePath)) {
                const data = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf8'));
                
                // Recuperar contadores si existen
                if (data['_counters']) {
                    this.counters = data['_counters'];
                    delete data['_counters'];
                }
                
                // Convertir objeto a Map
                Object.keys(data).forEach(key => {
                    this.customerData.set(key, data[key]);
                });
                
                console.log('Datos de clientes cargados correctamente');
            }
        } catch (error) {
            console.error('Error al cargar datos de clientes:', error);
        }
    }
    
    // Configurar guardado periódico (cada 5 minutos)
    setupPeriodicSave() {
        setInterval(() => {
            this.saveData();
        }, 5 * 60 * 1000); // 5 minutos
    }
    
    // Genera un número de orden/reserva secuencial
    generateReferenceNumber(type) {
        // Incrementar el contador para el tipo específico
        this.counters[type]++;
        
        // Prefijo según el tipo (4 para pedidos, 5 para reservas)
        const prefix = type === 'purchase' ? '4' : '5';
        
        // Formatear número con ceros a la izquierda para mantener consistencia
        return prefix + this.counters[type].toString().padStart(4, '0');
    }
    
    // Obtener todas las reservas confirmadas
    getAllConfirmedReservations() {
        const reservations = [];
        this.customerData.forEach((userData, userId) => {
            if (userData.reservation && 
                userData.reservation.data && 
                userData.reservation.data.status === 'confirmed') {
                reservations.push({
                    userId,
                    ...userData.reservation.data
                });
            }
        });
        return reservations;
    }
    
    // Obtener todos los pedidos confirmados
    getAllConfirmedPurchases() {
        const purchases = [];
        this.customerData.forEach((userData, userId) => {
            if (userData.purchase && 
                userData.purchase.data && 
                userData.purchase.data.status === 'confirmed') {
                purchases.push({
                    userId,
                    ...userData.purchase.data
                });
            }
        });
        return purchases;
    }
    
    // Obtener pedidos filtrados por tipo
    getConfirmedPurchasesByType(type) {
        const purchases = [];
        this.customerData.forEach((userData, userId) => {
            if (userData.purchase && 
                userData.purchase.data && 
                userData.purchase.data.status === 'confirmed' &&
                userData.purchase.data.type === type) {
                purchases.push({
                    userId,
                    ...userData.purchase.data
                });
            }
        });
        return purchases;
    }
    
    // Inicializar un pedido con un tipo específico
    initPurchaseWithType(userId, purchaseType) {
        const userData = this.initCustomerData(userId, 'purchase');
        userData.purchase.data.type = purchaseType;
        userData.purchase.data.status = 'pending';
        
        this.saveData();
        return userData;
    }
}

module.exports = new CustomerDataManager();