import os
import random
import string
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, make_response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import jwt

# Environment Configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'vms_super_secret_key_change_in_production_2026')
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'adminpass')

# Determine DB URI: Use SQLite in instance or /tmp for Vercel
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    # If running on Vercel read-only filesystem, place DB in /tmp/
    if os.environ.get('VERCEL'):
        DATABASE_URL = 'sqlite:////tmp/vms.db'
    else:
        DATABASE_URL = 'sqlite:///vms.db'

# Flask App Initialization
app = Flask(__name__, static_folder='../public', static_url_path='')
app.config['SECRET_KEY'] = SECRET_KEY
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app)
db = SQLAlchemy(app)

# Database Models
class Visitor(db.Model):
    __tablename__ = 'visitors'

    id = db.Column(db.Integer, primary_key=True)
    pass_number = db.Column(db.String(64), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(120), nullable=True)
    purpose = db.Column(db.String(120), nullable=False)
    department = db.Column(db.String(120), nullable=False)
    host_name = db.Column(db.String(120), nullable=False)
    photo_base64 = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), default='checked_in')  # 'checked_in' or 'checked_out'
    check_in_time = db.Column(db.DateTime, default=datetime.utcnow)
    expected_check_out_time = db.Column(db.DateTime, nullable=False)
    actual_check_out_time = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    def to_dict(self):
        now = datetime.utcnow()
        is_overdue = self.status == 'checked_in' and self.expected_check_out_time and now > self.expected_check_out_time
        
        return {
            'id': self.id,
            'pass_number': self.pass_number,
            'name': self.name,
            'phone': self.phone,
            'email': self.email or '',
            'purpose': self.purpose,
            'department': self.department,
            'host_name': self.host_name,
            'photo_base64': self.photo_base64 or '',
            'status': self.status,
            'is_overdue': is_overdue,
            'check_in_time': self.check_in_time.strftime('%Y-%m-%d %H:%M:%S') if self.check_in_time else None,
            'check_in_time_iso': self.check_in_time.isoformat() + 'Z' if self.check_in_time else None,
            'expected_check_out_time': self.expected_check_out_time.strftime('%Y-%m-%d %H:%M:%S') if self.expected_check_out_time else None,
            'expected_check_out_time_iso': self.expected_check_out_time.isoformat() + 'Z' if self.expected_check_out_time else None,
            'actual_check_out_time': self.actual_check_out_time.strftime('%Y-%m-%d %H:%M:%S') if self.actual_check_out_time else None,
            'actual_check_out_time_iso': self.actual_check_out_time.isoformat() + 'Z' if self.actual_check_out_time else None,
            'notes': self.notes or ''
        }

# Helper: Pass Number Generator
def generate_pass_number():
    date_str = datetime.utcnow().strftime('%Y%m%d')
    random_str = ''.join(random.choices(string.digits, k=4))
    return f"VMS-{date_str}-{random_str}"

# JWT Helper Decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'message': 'Authentication token is missing!'}), 401
            
        try:
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user = payload.get('sub')
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired. Please log in again.'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid token. Authorization denied.'}), 401

        return f(current_user, *args, **kwargs)
    return decorated

# Initialize DB Tables
with app.app_context():
    db.create_all()

# --- Static File Serving Routes ---
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

# --- API Endpoints ---

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'system': 'Visitor Management System API',
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'database': DATABASE_URL.split('://')[0]
    }), 200

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')

    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        expiration = datetime.utcnow() + timedelta(hours=8)
        token = jwt.encode(
            {'sub': username, 'exp': expiration, 'role': 'admin'},
            app.config['SECRET_KEY'],
            algorithm='HS256'
        )
        return jsonify({
            'message': 'Login successful',
            'token': token,
            'user': {
                'username': username,
                'role': 'Admin'
            }
        }), 200
    
    return jsonify({'message': 'Invalid username or password'}), 401

@app.route('/api/visitors', methods=['POST'])
def register_visitor():
    data = request.get_json() or {}

    # Validation
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    purpose = data.get('purpose', '').strip()
    department = data.get('department', '').strip()
    host_name = data.get('host_name', '').strip()

    if not name or not phone or not purpose or not department or not host_name:
        return jsonify({'message': 'Required fields missing: name, phone, purpose, department, and host_name are required.'}), 400

    # Handle Expected Check-out Time
    now = datetime.utcnow()
    expected_checkout_str = data.get('expected_check_out_time')
    
    if expected_checkout_str:
        try:
            # Accepts ISO strings like "2026-08-16T21:30" or "2026-08-16 21:30:00"
            clean_str = expected_checkout_str.replace('T', ' ')
            if len(clean_str) == 16:
                expected_checkout = datetime.strptime(clean_str, '%Y-%m-%d %H:%M')
            else:
                expected_checkout = datetime.strptime(clean_str.split('.')[0], '%Y-%m-%d %H:%M:%S')
        except ValueError:
            expected_checkout = now + timedelta(hours=4)
    else:
        # Default duration (e.g., 4 hours)
        duration_hours = int(data.get('duration_hours', 4))
        expected_checkout = now + timedelta(hours=duration_hours)

    pass_num = generate_pass_number()
    # Ensure pass_number uniqueness
    while Visitor.query.filter_by(pass_number=pass_num).first():
        pass_num = generate_pass_number()

    visitor = Visitor(
        pass_number=pass_num,
        name=name,
        phone=phone,
        email=data.get('email', '').strip() or None,
        purpose=purpose,
        department=department,
        host_name=host_name,
        photo_base64=data.get('photo_base64', '') or None,
        status='checked_in',
        check_in_time=now,
        expected_check_out_time=expected_checkout,
        notes=data.get('notes', '').strip() or None
    )

    db.session.add(visitor)
    db.session.commit()

    return jsonify({
        'message': 'Visitor registered successfully!',
        'visitor': visitor.to_dict()
    }), 201

@app.route('/api/visitors', methods=['GET'])
def get_visitors():
    query = Visitor.query

    # Search filter (name, phone, email, pass_number, host_name)
    search = request.args.get('search', '').strip()
    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            (Visitor.name.ilike(search_fmt)) |
            (Visitor.phone.ilike(search_fmt)) |
            (Visitor.email.ilike(search_fmt)) |
            (Visitor.pass_number.ilike(search_fmt)) |
            (Visitor.host_name.ilike(search_fmt))
        )

    # Status filter
    status = request.args.get('status', 'all').strip().lower()
    if status in ['checked_in', 'checked_out']:
        query = query.filter(Visitor.status == status)

    # Department filter
    department = request.args.get('department', 'all').strip()
    if department and department.lower() != 'all':
        query = query.filter(Visitor.department == department)

    # Date filter (YYYY-MM-DD)
    date_str = request.args.get('date', '').strip()
    if date_str:
        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            next_date = target_date + timedelta(days=1)
            query = query.filter(Visitor.check_in_time >= target_date, Visitor.check_in_time < next_date)
        except ValueError:
            pass

    # Order by newest check-in time first
    visitors = query.order_by(Visitor.check_in_time.desc()).all()
    return jsonify([v.to_dict() for v in visitors]), 200

@app.route('/api/visitors/<int:visitor_id>', methods=['GET'])
def get_visitor(visitor_id):
    visitor = Visitor.query.get(visitor_id)
    if not visitor:
        return jsonify({'message': f'Visitor with ID {visitor_id} not found'}), 404
    return jsonify(visitor.to_dict()), 200

@app.route('/api/visitors/<int:visitor_id>/checkout', methods=['PUT'])
def checkout_visitor(visitor_id):
    visitor = Visitor.query.get(visitor_id)
    if not visitor:
        return jsonify({'message': f'Visitor with ID {visitor_id} not found'}), 404

    if visitor.status == 'checked_out':
        return jsonify({'message': 'Visitor is already checked out', 'visitor': visitor.to_dict()}), 200

    visitor.status = 'checked_out'
    visitor.actual_check_out_time = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'message': f'Visitor {visitor.name} checked out successfully',
        'visitor': visitor.to_dict()
    }), 200

@app.route('/api/visitors/<int:visitor_id>', methods=['DELETE'])
def delete_visitor(visitor_id):
    visitor = Visitor.query.get(visitor_id)
    if not visitor:
        return jsonify({'message': f'Visitor with ID {visitor_id} not found'}), 404

    db.session.delete(visitor)
    db.session.commit()

    return jsonify({'message': 'Visitor record deleted successfully'}), 200

@app.route('/api/stats', methods=['GET'])
def get_stats():
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)

    total_today = Visitor.query.filter(Visitor.check_in_time >= today_start).count()
    currently_checked_in = Visitor.query.filter(Visitor.status == 'checked_in').count()
    checked_out_today = Visitor.query.filter(
        Visitor.status == 'checked_out',
        Visitor.actual_check_out_time >= today_start
    ).count()

    overdue_count = Visitor.query.filter(
        Visitor.status == 'checked_in',
        Visitor.expected_check_out_time < now
    ).count()

    # Department breakdown
    all_visitors = Visitor.query.all()
    dept_counts = {}
    for v in all_visitors:
        dept_counts[v.department] = dept_counts.get(v.department, 0) + 1

    return jsonify({
        'total_today': total_today,
        'currently_checked_in': currently_checked_in,
        'checked_out_today': checked_out_today,
        'overdue_count': overdue_count,
        'department_breakdown': dept_counts,
        'total_all_time': len(all_visitors)
    }), 200

@app.route('/api/seed', methods=['POST'])
def seed_sample_data():
    """Seeds realistic sample data if DB has fewer than 3 records."""
    count = Visitor.query.count()
    if count >= 5:
        return jsonify({'message': 'Database already has sufficient data', 'count': count}), 200

    now = datetime.utcnow()
    samples = [
        {
            'name': 'Sarah Jenkins',
            'phone': '+1 (555) 234-5678',
            'email': 'sarah.j@acmecorp.io',
            'purpose': 'Client Partnership Meeting',
            'department': 'Executive',
            'host_name': 'David Vance (CEO)',
            'status': 'checked_in',
            'offset_in': -45,  # 45 mins ago
            'offset_exp': 120, # 2 hours from checkin
        },
        {
            'name': 'Marcus Brody',
            'phone': '+1 (555) 876-5432',
            'email': 'mbrody@archeotech.org',
            'purpose': 'Job Interview - Senior Lead Engineer',
            'department': 'HR & Recruitment',
            'host_name': 'Rachel Green (HR Dir)',
            'status': 'checked_in',
            'offset_in': -120, # 2 hrs ago
            'offset_exp': -15, # Past expected checkout (overdue test)
        },
        {
            'name': 'Elena Rostova',
            'phone': '+1 (555) 345-6789',
            'email': 'elena.r@cybersec.net',
            'purpose': 'Infrastructure Security Audit',
            'department': 'Information Technology',
            'host_name': 'Alex Rivera (CTO)',
            'status': 'checked_in',
            'offset_in': -90,
            'offset_exp': 180,
        },
        {
            'name': 'David Kim',
            'phone': '+1 (555) 901-2345',
            'email': 'dkim@logistics-express.com',
            'purpose': 'Hardware Equipment Delivery',
            'department': 'Operations',
            'host_name': 'Front Desk Reception',
            'status': 'checked_out',
            'offset_in': -240,
            'offset_exp': -180,
            'offset_out': -175,
        },
        {
            'name': 'Sophia Martinez',
            'phone': '+1 (555) 432-1098',
            'email': 'smartinez@designstudio.co',
            'purpose': 'Brand Refresh Strategy Session',
            'department': 'Marketing & PR',
            'host_name': 'Jessica Taylor',
            'status': 'checked_out',
            'offset_in': -300,
            'offset_exp': -120,
            'offset_out': -115,
        }
    ]

    added = 0
    for sample in samples:
        check_in = now + timedelta(minutes=sample['offset_in'])
        exp_out = check_in + timedelta(minutes=sample['offset_exp'])
        act_out = (now + timedelta(minutes=sample['offset_out'])) if sample.get('offset_out') else None
        
        pass_num = generate_pass_number()
        visitor = Visitor(
            pass_number=pass_num,
            name=sample['name'],
            phone=sample['phone'],
            email=sample['email'],
            purpose=sample['purpose'],
            department=sample['department'],
            host_name=sample['host_name'],
            status=sample['status'],
            check_in_time=check_in,
            expected_check_out_time=exp_out,
            actual_check_out_time=act_out,
            notes='Sample seed record for demonstration'
        )
        db.session.add(visitor)
        added += 1

    db.session.commit()
    return jsonify({'message': f'Successfully seeded {added} sample visitor records!', 'count': Visitor.query.count()}), 201

# Entry point for local execution
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"🚀 Starting Visitor Management System backend on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
